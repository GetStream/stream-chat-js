/**
 * Escapes a string for use in a regular expression
 * @param text - The string to escape
 * @returns The escaped string
 * What does this regex do?

 The regex escapes special regex characters by adding a backslash before them. Here's what it matches:
 - dash
 [ ] square brackets
 { } curly braces
 ( ) parentheses
 * asterisk
 + plus
 ? question mark
 . period
 , comma
 / forward slash
 \ backslash
 ^ caret
 $ dollar sign
 | pipe
 # hash

 The \\$& replacement adds a backslash before any matched character.
 This is needed when you want to use these characters literally
 in a regex pattern instead of their special regex meanings.
 For example:
 escapeCommandRegExp("hello.world")  // Returns: "hello\.world"
 escapeCommandRegExp("[test]")       // Returns: "\[test\]"

 This is commonly used when building dynamic regex patterns from user input to prevent special characters from being interpreted as regex syntax.
 */
export function escapeCommandRegExp(text: string) {
  return text.replace(/[-[\]{}()*+?.,/\\^$|#]/g, '\\$&');
}

export const getRawCommandName = (text?: string) =>
  text?.match(/^\/(\S+)(?:\s.*)?$/)?.[1];

export const getCompleteCommandInString = (text: string) => {
  // starts with "/" followed by 1+ non-whitespace chars followed by 1+ white-space chars
  // the command name is extracted into a separate group
  const match = text.match(/^\/(\S+)\s+.*/);
  const commandName = match && match[1];
  return commandName;
};

export const stripCommandFromText = (text: string, commandName: string) =>
  text.replace(new RegExp(`^${escapeCommandRegExp(`/${commandName}`)}\\s*`), '');
