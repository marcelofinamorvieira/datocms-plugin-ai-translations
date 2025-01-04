// src/utils/translation/utils.ts

/**
 * Recursively extracts all text values from a nested structure,
 * commonly used with structured text fields.
 */
export function extractTextValues(data: unknown): string[] {
  const textValues: string[] = [];

  function traverse(obj: any) {
    if (Array.isArray(obj)) {
      obj.forEach(traverse);
    } else if (typeof obj === 'object' && obj !== null) {
      if (obj.text !== undefined) {
        textValues.push(obj.text);
      }
      Object.values(obj).forEach(traverse);
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
export function removeIds(obj: unknown): any {
  if (Array.isArray(obj)) {
    return obj.map(removeIds);
  } else if (typeof obj === 'object' && obj !== null) {
    const newObj: any = {};
    for (const [key, value] of Object.entries(obj)) {
      // Keep id if it's in a meta array item with a value property
      if (
        key === 'id' &&
        obj.hasOwnProperty('value') &&
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
): any {
  let index = 0;
  function traverse(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map((item) => traverse(item));
    } else if (typeof obj === 'object' && obj !== null) {
      const newObj: any = {};
      for (const key in obj) {
        if (key === 'text' && index < textValues.length) {
          newObj[key] = textValues[index++];
        } else {
          newObj[key] = traverse(obj[key]);
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
export function deleteItemIdKeys(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(deleteItemIdKeys);
  } else if (typeof obj === 'object' && obj !== null) {
    const newObj: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key !== 'itemId') {
        newObj[key] = deleteItemIdKeys(value);
      }
    }
    return newObj;
  }
  return obj;
}
