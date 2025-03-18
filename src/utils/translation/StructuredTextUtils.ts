/**
 * StructuredTextUtils.ts
 * Utility functions for handling structured text nodes in DatoCMS.
 * This file provides helper functions to identify different types of nodes.
 */

/**
 * Basic structure for a node in the Structured Text field.
 */
export interface StructuredTextNode {
  type?: string;
  value?: string;
  children?: StructuredTextNode[];
  item?: string;
  [key: string]: unknown;
}

/**
 * Checks if a node is a text node.
 * Text nodes contain actual content to be translated.
 */
export function isTextNode(node: StructuredTextNode): boolean {
  return node.type === 'span' && typeof node.value === 'string';
}

/**
 * Checks if a node is a block node.
 * Block nodes are specialized nodes that require different handling.
 */
export function isBlockNode(node: StructuredTextNode): boolean {
  return node.type === 'block';
}

/**
 * Checks if a node is an inline item node.
 * Inline items are references to other content that should be preserved.
 */
export function isInlineItem(node: StructuredTextNode): boolean {
  return node.type === 'inlineItem';
}

/**
 * Checks if a node is an item link node.
 * Item links are references to other content that should be preserved.
 */
export function isItemLink(node: StructuredTextNode): boolean {
  return node.type === 'itemLink';
}
