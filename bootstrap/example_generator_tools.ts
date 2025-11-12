// bootstrap/example_generator_tools.ts

/**
 * This file contains mock data and reference implementations specifically for
 * testing and demonstrating the neurofeedback protocol generation workflow.
 */

// This is the "test article" requested by the user. When this abstract is used
// as 'sourceMaterial' for the 'Develop Tool from Objective' tool, the system
// should generate a UI component that is functionally and visually identical to
// the pre-built 'Example: Alpha Wave Relaxation' tool.
export const MOCK_ALPHA_WAVE_ABSTRACT = `
Abstract: Increased power in the alpha frequency band (8-12 Hz) is strongly associated with states of calm relaxation and mental clarity. This paper describes a neurofeedback protocol designed to train individuals to voluntarily increase their alpha wave activity. 

The core metric for this protocol is the 'alpha_power_ratio', calculated as the power within the alpha band divided by the total spectral power. 

The user interface provides real-time visual feedback via a central circular object. As the 'alpha_power_ratio' increases, the circle should expand in size and its color should become brighter and more saturated, providing positive reinforcement. A text display should show the current alpha power as a percentage. The guiding instruction for the user is to "Relax and let the circle grow."
`.trim();
