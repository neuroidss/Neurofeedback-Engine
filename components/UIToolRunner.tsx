// VIBE_NOTE: Do not escape backticks or dollar signs in template literals in this file.
// Escaping is only for 'implementationCode' strings in tool definitions.
import React, { Component, type ReactNode, type ErrorInfo } from 'react';
import type { LLMTool, UIToolRunnerProps } from '../types';
import DebugLogView from './ui_tools/DebugLogView';
import * as Icons from './icons';

// Tell TypeScript about the global Babel object from the script tag in index.html
declare var Babel: any;

interface UIToolRunnerComponentProps {
  tool: LLMTool;
  props: UIToolRunnerProps;
}

// A wrapper to catch runtime errors in the compiled component.
type ErrorBoundaryProps = {
  fallback: ReactNode;
  toolName: string;
  children?: ReactNode;
};
type ErrorBoundaryState = {
  hasError: boolean;
};

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: any): ErrorBoundaryState {
    console.error("UI Tool Runner caught an error:", error);
    return { hasError: true };
  }

  componentDidUpdate(prevProps: Readonly<ErrorBoundaryProps>) {
    if (this.props.toolName !== prevProps.toolName) {
      this.setState({ hasError: false });
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`UI Tool Runner Error in tool '${this.props.toolName}':`, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

const UIToolRunner: React.FC<UIToolRunnerComponentProps> = ({ tool, props }) => {
  // Memoize the compiled component to prevent re-compiling and re-mounting on every render,
  // which was causing the flickering and state loss in complex components like the interactive graph.
  const CompiledComponent = React.useMemo(() => {
    if (tool.category !== 'UI Component') {
      return () => <div>Error: Tool "{tool.name}" is not a UI Component.</div>;
    }

    // Special case for complex, directly imported components that don't need compilation.
    if (tool.name === 'Debug Log View') {
        return DebugLogView;
    }

    const code = tool.implementationCode || '';
    
    let sanitizedCode = code;

    // Robust Extraction: Logic to handle conversational wrapper text (e.g. "Here is your code: ...")
    // If the code contains markdown code blocks, we extract the content of the first one.
    const markdownBlockRegex = /```(?:javascript|js|jsx|typescript|ts|tsx)?\s*([\s\S]*?)```/i;
    const match = code.match(markdownBlockRegex);
    if (match && match[1]) {
        sanitizedCode = match[1];
    } else {
        // Fallback cleanup if no blocks found (legacy or raw code)
        sanitizedCode = code
          .replace(/^```(javascript|js|jsx|typescript|ts)?\s*[\r\n]*/i, '') 
          .replace(/```\s*$/, '');
    }

    // --- Advanced Sanitization ---
    
    // 1. Detect Export Default
    // We look for 'export default ComponentName' so we can manually return it later.
    let exportedComponentName = null;
    const exportDefaultMatch = sanitizedCode.match(/export\s+default\s+(?:function\s+|class\s+)?(\w+)/);
    if (exportDefaultMatch) {
        exportedComponentName = exportDefaultMatch[1];
    }

    sanitizedCode = sanitizedCode
      // Remove CSS/Side-effect imports: import './styles.css';
      .replace(/^\s*import\s+['"][^'"]+['"];?/gm, '')
      // Remove Standard imports: import X from 'y';
      .replace(/^\s*import\s+[\s\S]*?from\s+['"][^'"]+['"];?/gm, '') 
      // Remove 'export default' keywords but keep the declaration
      .replace(/^\s*export\s+default\s+/gm, '') 
      // Remove named 'export' keywords
      .replace(/^\s*export\s+/gm, '') 
      // FIX: Common AI error: space in optional chaining (e.g. "data ? .prop" -> "data?.prop")
      .replace(/\?\s+\./g, '?.')
      .trim();

    // --- FIX: Handle IIFEs and Block Wrappers ---
    
    // Case A: Unwrap block-wrapped IIFEs (e.g. { (() => { ... })() })
    // This is a common artifact where AI thinks it's writing inside a JSX expression.
    if (sanitizedCode.startsWith('{') && sanitizedCode.endsWith('}')) {
        const inner = sanitizedCode.slice(1, -1).trim();
        // Check if inner content looks like an IIFE (starts with ( and ends with invocation)
        if (inner.startsWith('(') && /[\}\)]\s*\(\)\s*;?$/.test(inner)) {
            sanitizedCode = inner;
        }
    }

    // Case B: Add 'return' to IIFEs that are missing it
    // If the code is just an IIFE `(() => { ... })()`, it needs to be returned to the runner function.
    if (sanitizedCode.startsWith('(') && /[\}\)]\s*\(\)\s*;?$/.test(sanitizedCode)) {
        // Ensure it's already a return statement
        if (!sanitizedCode.startsWith('return ')) {
            sanitizedCode = `return ${sanitizedCode}`;
        }
    }
    
    // 2. Append Return Statement if an export was found
    // This ensures that "export default App" becomes "return React.createElement(App, props)"
    if (exportedComponentName) {
        sanitizedCode += `\nreturn React.createElement(${exportedComponentName}, props);`;
    }

    // Decouple component compilation from the live props object.
    // The list of props to destructure is derived from the tool's static definition.
    // This makes the compiled function stable across renders.
    const propKeys = tool.parameters?.map(p => p.name) || [];

    const componentSource = `(props) => {
      const { ${propKeys.join(', ')} } = props;
      ${sanitizedCode}
    }`;

    try {
      const { code: transformedCode } = Babel.transform(componentSource, {
        presets: ['react']
      });
      
      const iconNames = Object.keys(Icons);
      const iconComponents = Object.values(Icons);
      
      const componentFactory = new Function('React', 'UIToolRunner', ...iconNames, `return ${transformedCode}`);
      return componentFactory(React, UIToolRunner, ...iconComponents);

    } catch (e) {
      console.error(`Error compiling UI tool '${tool.name}':`, e);
      console.error('Offending code:', tool.implementationCode);
      return () => (
        <div className="p-4 bg-red-900/50 border-2 border-dashed border-red-500 rounded-lg text-red-300">
          <p className="font-bold">UI Compilation Error in "{tool.name}" (v{tool.version})</p>
          <pre className="mt-2 text-xs whitespace-pre-wrap">{e instanceof Error ? e.message : String(e)}</pre>
        </div>
      );
    }
  // The dependencies ensure re-compilation only happens if the tool's definition changes.
  // Using tool.id and tool.version is sufficient to detect tool updates.
  }, [tool.id, tool.version]);


  const fallback = (
    <div className="p-4 bg-yellow-900/50 border-2 border-dashed border-yellow-500 rounded-lg text-yellow-300">
      <p className="font-bold">UI Runtime Error in "{tool.name}" (v{tool.version})</p>
      <p className="text-sm">The component failed to render. Check console for details.</p>
    </div>
  );

  return (
    <ErrorBoundary fallback={fallback} toolName={tool.name}>
        <CompiledComponent {...props} />
    </ErrorBoundary>
  );
};

export default UIToolRunner;