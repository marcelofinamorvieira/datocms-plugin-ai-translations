// src/utils/translation/utils.ts

/**
 * Recursively extracts all text values from a nested structure,
 * commonly used with structured text fields.
 */
export function extractTextValues(data: unknown): string[] {
  const textValues: string[] = [];

  // Define a recursive type for structured text nodes
  type StructuredTextItem = {
    text?: string;
    [key: string]: unknown;
  };

  function traverse(obj: unknown) {
    if (Array.isArray(obj)) {
      obj.forEach(traverse);
    } else if (typeof obj === 'object' && obj !== null) {
      const item = obj as StructuredTextItem;
      if (item.text !== undefined) {
        textValues.push(item.text);
      }
      Object.values(item).forEach(traverse);
    }
  }

  traverse(data);
  return textValues;
}

/**
 * Recursively removes 'id' keys from objects,
 * which is useful when the API returns extraneous ID fields
 * that we need to strip out before re-uploading or patching.
 */
export function removeIds(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(removeIds);
  }
  
  if (typeof obj === 'object' && obj !== null) {
    const newObj: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      // Keep id if it's in a meta array item with a value property
      if (
        key === 'id' &&
        (obj as Record<string, unknown>).value !== undefined &&
        Object.keys(obj).length === 2
      ) {
        newObj[key] = value;
      } else if (key !== 'id') {
        newObj[key] = removeIds(value);
      }
    }
    return newObj;
  }
  
  return obj;
}

/**
 * Reconstructs an object by replacing 'text' fields with values from a given array of strings.
 * This is used after translating the strings extracted by `extractTextValues`.
 *
 * @param originalObject The original object with text fields.
 * @param textValues The array of translated text strings.
 * @returns The reconstructed object with translated text inserted back in.
 */
export function reconstructObject(
  originalObject: unknown,
  textValues: string[]
): unknown {
  let index = 0;
  
  type StructuredTextNode = {
    text?: string;
    [key: string]: unknown;
  };

  function traverse(obj: unknown): unknown {
    if (Array.isArray(obj)) {
      return obj.map((item) => traverse(item));
    }
    
    if (typeof obj === 'object' && obj !== null) {
      const typedObj = obj as StructuredTextNode;
      const newObj: Record<string, unknown> = {};
      for (const key in typedObj) {
        if (key === 'text' && index < textValues.length) {
          newObj[key] = textValues[index++];
        } else {
          newObj[key] = traverse(typedObj[key]);
        }
      }
      return newObj;
    }
    return obj;
  }
  return traverse(originalObject);
}

/**
 * Inserts an object into an array at a specified index and returns a new array.
 * Useful when we need to re-inject block nodes into structured text at their original positions.
 */
export function insertObjectAtIndex<T>(
  array: T[],
  object: T,
  index: number
): T[] {
  return [...array.slice(0, index), object, ...array.slice(index)];
}

/**
 * Deletes 'itemId' keys from an object recursively, similar to removeIds but specifically targeting itemId.
 *
 * @param obj The object to clean.
 * @returns A new object without 'itemId' fields.
 */
export function deleteItemIdKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(deleteItemIdKeys);
  }
  
  if (typeof obj === 'object' && obj !== null) {
    const newObj: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (key !== 'itemId') {
        newObj[key] = deleteItemIdKeys(value);
      }
    }
    return newObj;
  }
  return obj;
}
