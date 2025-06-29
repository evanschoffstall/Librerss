import React from "react";

/**
 * Creates JSX with multiple lines of text separated by line breaks
 * 
 * @overload
 * @param text - String to split into lines
 * @param wordCounts - Numbers indicating how many words per line
 * @returns JSX fragment with text and <br /> elements
 * 
 * @overload  
 * @param lines - Individual string arguments for each line
 * @returns JSX fragment with text and <br /> elements
 * 
 * @example
 * // Split by word count
 * multiLine("Reviving the free cloud tradition", 3, 2)
 * // Renders: Reviving the free<br />cloud tradition
 * 
 * @example
 * // Direct lines
 * multiLine("First line", "Second line", "Third line")
 * // Renders: First line<br />Second line<br />Third line
 */
export function multiLine(text: string, ...wordCounts: number[]): React.JSX.Element;
export function multiLine(...lines: string[]): React.JSX.Element;
export function multiLine(textOrFirstLine: string, ...args: (string | number)[]): React.JSX.Element {
  let finalLines: string[];

  // Check if we're using word count mode (second argument is a number)
  if (args.length > 0 && typeof args[0] === 'number') {
    const text = textOrFirstLine;
    const wordCounts = args as number[];
    const words = text.split(' ');
    finalLines = [];

    let wordIndex = 0;
    for (const count of wordCounts) {
      const lineWords = words.slice(wordIndex, wordIndex + count);
      finalLines.push(lineWords.join(' '));
      wordIndex += count;
    }

    // Add remaining words to the last line if any
    if (wordIndex < words.length) {
      const remainingWords = words.slice(wordIndex);
      if (finalLines.length > 0) {
        finalLines[finalLines.length - 1] += ' ' + remainingWords.join(' ');
      } else {
        finalLines.push(remainingWords.join(' '));
      }
    }
  } else {
    // Direct lines mode
    finalLines = [textOrFirstLine, ...(args as string[])];
  }

  return (
    <>
      {finalLines.map((line, index) => (
        <React.Fragment key={index}>
          {line}
          {index < finalLines.length - 1 && <br />}
        </React.Fragment>
      ))}
    </>
  );
}
