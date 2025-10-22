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
 * Checks if a node is a text node (contains translatable content).
 *
 * @param node - Structured text node.
 * @returns True if the node is a text node.
 */
export function isTextNode(node: StructuredTextNode): boolean {
  return node.type === 'span' && typeof node.value === 'string';
}

/**
 * Checks if a node is a block node.
 *
 * @param node - Structured text node.
 * @returns True if the node is a block node.
 */
export function isBlockNode(node: StructuredTextNode): boolean {
  return node.type === 'block';
}

/**
 * Checks if a node is an inline item node (reference to another item).
 *
 * @param node - Structured text node.
 * @returns True if the node is an inline item.
 */
export function isInlineItem(node: StructuredTextNode): boolean {
  return node.type === 'inlineItem';
}

/**
 * Checks if a node is an item link node.
 *
 * @param node - Structured text node.
 * @returns True if the node is an item link.
 */
export function isItemLink(node: StructuredTextNode): boolean {
  return node.type === 'itemLink';
}
