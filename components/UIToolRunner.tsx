
import React, { Component, type ReactNode, type ErrorInfo, useMemo } from 'react';
import type { LLMTool, UIToolRunnerProps } from '../types';
import DebugLogView from './ui_tools/DebugLogView';
import * as Icons from './icons';

// Access global Babel
declare const Babel: any;

interface ErrorBoundaryProps {
  children?: ReactNode;
  fallback: ReactNode;
  toolName: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  // Explicitly declare props to satisfy TypeScript if generic inference fails
  props: ErrorBoundaryProps;
  state: ErrorBoundaryState = { hasError: false };

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.props = props;
  }

  static getDerivedStateFromError(_: Error): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error(`[UIToolRunner] Error in tool '${this.props.toolName}':`, error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

// --- Main Component ---

interface UIToolRunnerComponentProps {
  tool: LLMTool;
  props: UIToolRunnerProps;
}

const UIToolRunner: React.FC<UIToolRunnerComponentProps> = ({ tool, props }) => {
  // Memoize the compiled component to prevent re-compiling and re-mounting on every render
  const CompiledComponent = useMemo(() => {
    if (tool.category !== 'UI Component') {
      return () => <div className="text-red-500 p-4 border border-red-500 rounded">Error: Tool "{tool.name}" is not a UI Component.</div>;
    }

    // Special case for complex, directly imported components to avoid Eval/Babel overhead
    if (tool.name === 'Debug Log View') {
        return DebugLogView;
    }

    const code = tool.implementationCode || '';
    let sanitizedCode = code;

    // 1. Strip Markdown Code Blocks
    const markdownBlockRegex = /```(?:javascript|js|jsx|typescript|ts|tsx)?\s*([\s\S]*?)```/i;
    const match = code.match(markdownBlockRegex);
    if (match && match[1]) {
        sanitizedCode = match[1];
    } else {
        sanitizedCode = code
          .replace(/^```(javascript|js|jsx|typescript|ts)?\s*[\r\n]*/i, '') 
          .replace(/```\s*$/, '');
    }

    // 2. Handle Default Exports and Imports (Naive Strip)
    let exportedComponentName = null;
    const exportDefaultMatch = sanitizedCode.match(/export\s+default\s+(?:function\s+|class\s+)?(\w+)/);
    if (exportDefaultMatch) {
        exportedComponentName = exportDefaultMatch[1];
    }

    sanitizedCode = sanitizedCode
      .replace(/^\s*import\s+['"][^'"]+['"];?/gm, '')
      .replace(/^\s*import\s+[\s\S]*?from\s+['"][^'"]+['"];?/gm, '') 
      .replace(/^\s*export\s+default\s+/gm, '') 
      .replace(/^\s*export\s+/gm, '') 
      .replace(/\?\s+\./g, '?.') // Fix sloppy optional chaining spacing
      .trim();

    // 3. Unwrap Object/Function Expressions
    if (sanitizedCode.startsWith('{') && sanitizedCode.endsWith('}')) {
        const inner = sanitizedCode.slice(1, -1).trim();
        // Heuristic: If it looks like an IIFE body inside braces
        if (inner.startsWith('(') && /[\}\)]\s*\(\)\s*;?$/.test(inner)) {
            sanitizedCode = inner;
        }
    }

    // 4. Ensure Return Statement
    if (sanitizedCode.startsWith('(') && /[\}\)]\s*\(\)\s*;?$/.test(sanitizedCode)) {
        if (!sanitizedCode.startsWith('return ')) {
            sanitizedCode = `return ${sanitizedCode}`;
        }
    }
    
    if (exportedComponentName) {
        sanitizedCode += `\nreturn React.createElement(${exportedComponentName}, props);`;
    }

    // 5. Construct Component Source
    // We inject keys from `props` into the scope
    const propKeys = tool.parameters?.map(p => p.name) || [];
    
    // Note: We wrap in a function that takes 'props' and destructures it
    const componentSource = `(props) => {
      const { ${propKeys.join(', ')} } = props;
      ${sanitizedCode}
    }`;

    try {
      // 6. Transpile with Babel (JSX -> JS)
      const { code: transformedCode } = Babel.transform(componentSource, {
        presets: ['react']
      });
      
      const iconNames = Object.keys(Icons);
      const iconComponents = Object.values(Icons);
      
      // 7. Create Function
      // We inject React, UIToolRunner (recursive), and Icons
      const componentFactory = new Function('React', 'UIToolRunner', ...iconNames, `return ${transformedCode}`);
      
      // 8. Instantiate
      return componentFactory(React, UIToolRunner, ...iconComponents);

    } catch (e) {
      console.error(`Error compiling UI tool '${tool.name}':`, e);
      return () => (
        <div className="p-4 bg-red-900/20 border-2 border-dashed border-red-500 rounded-lg text-red-300 font-mono text-xs">
          <p className="font-bold text-sm mb-2">Compilation Error: "{tool.name}"</p>
          <pre className="whitespace-pre-wrap">{e instanceof Error ? e.message : String(e)}</pre>
        </div>
      );
    }
  }, [tool.id, tool.version, tool.implementationCode, tool.name, tool.category, tool.parameters]); 

  const fallbackUI = (
    <div className="p-4 bg-yellow-900/20 border-2 border-dashed border-yellow-500 rounded-lg text-yellow-300 font-mono text-xs">
      <p className="font-bold text-sm">Runtime Error: "{tool.name}"</p>
      <p>The component crashed while rendering.</p>
    </div>
  );

  return (
    <ErrorBoundary fallback={fallbackUI} toolName={tool.name}>
      <CompiledComponent {...props} />
    </ErrorBoundary>
  );
};

export default UIToolRunner;
