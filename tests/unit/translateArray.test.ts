import { describe, it, expect, vi } from 'vitest';
import { translateArray } from '../../src/utils/translation/translateArray';
import type { TranslationProvider } from '../../src/utils/translation/types';

// Mock plugin params
const pluginParams = {
  gptModel: 'gpt-4.1-mini',
  apiKey: 'test-key',
  translationFields: ['single_line'],
  prompt: '{fieldValue}',
} as any;

// Helper to create mock provider
function createMockProvider(completeTextFn: (prompt: string) => Promise<string>): TranslationProvider {
  return {
    vendor: 'openai',
    capabilities: { streaming: false },
    completeText: vi.fn(completeTextFn),
    streamText: async function* () { yield ''; },
  };
}

describe('translateArray - ICU Message Format Support', () => {
  it('should handle ICU plural messages without tokenizing them', async () => {
    const mockProvider = createMockProvider(async (prompt: string) => {
      // Check that the ICU message structure is preserved in the prompt
      expect(prompt).toContain('{count, plural,');
      expect(prompt).toContain('=0 {');
      expect(prompt).toContain('=1 {');
      expect(prompt).toContain('other {');
      
      // Return a translated version
      return JSON.stringify([
        'Du har {count, plural, =0 {inga följare ännu} =1 {en följare} other {# följare}}.'
      ]);
    });

    const result = await translateArray(
      mockProvider,
      pluginParams,
      ['You have {count, plural, =0 {no followers yet} =1 {one follower} other {# followers}}.'],
      'en',
      'sv'
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toBe('Du har {count, plural, =0 {inga följare ännu} =1 {en följare} other {# följare}}.');
    expect(mockProvider.completeText).toHaveBeenCalledOnce();
  });

  it('should handle ICU select messages', async () => {
    const mockProvider = createMockProvider(async () => {
      return JSON.stringify([
        '{gender, select, male {Il} female {Elle} other {Ils/Elles}} est en ligne.'
      ]);
    });

    const result = await translateArray(
      mockProvider,
      pluginParams,
      ['{gender, select, male {He} female {She} other {They}} is online.'],
      'en',
      'fr'
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toContain('{gender, select,');
    expect(mockProvider.completeText).toHaveBeenCalledOnce();
  });

  it('should handle deeply nested ICU messages', async () => {
    const mockProvider = createMockProvider(async () => {
      return JSON.stringify([
        '{taxableArea, select, yes {An additional {taxRate, number, percent} tax will be collected.} other {No taxes apply.}}'
      ]);
    });

    const result = await translateArray(
      mockProvider,
      pluginParams,
      ['{taxableArea, select, yes {An additional {taxRate, number, percent} tax will be collected.} other {No taxes apply.}}'],
      'en',
      'en'
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toContain('{taxableArea, select,');
    expect(result[0]).toContain('{taxRate, number, percent}');
  });

  it('should preserve simple placeholders while handling ICU messages', async () => {
    const mockProvider = createMockProvider(async (prompt: string) => {
      // Check that simple placeholders are tokenized
      expect(prompt).toContain('⟦PH_0⟧');
      // But ICU messages are not
      expect(prompt).toContain('{count, plural,');
      
      return JSON.stringify([
        'Bonjour ⟦PH_0⟧, vous avez {count, plural, =0 {aucun message} =1 {un message} other {# messages}}.'
      ]);
    });

    const result = await translateArray(
      mockProvider,
      pluginParams,
      ['Hello {name}, you have {count, plural, =0 {no messages} =1 {one message} other {# messages}}.'],
      'en',
      'fr'
    );

    expect(result).toHaveLength(1);
    // Simple placeholder should be restored
    expect(result[0]).toContain('{name}');
    // ICU message should be preserved
    expect(result[0]).toContain('{count, plural,');
  });

  it('should handle ICU number format messages', async () => {
    const mockProvider = createMockProvider(async () => {
      return JSON.stringify([
        'Le prix est {price, number, currency}.'
      ]);
    });

    const result = await translateArray(
      mockProvider,
      pluginParams,
      ['The price is {price, number, currency}.'],
      'en',
      'fr'
    );

    expect(result[0]).toContain('{price, number, currency}');
  });

  it('should handle ICU date format messages', async () => {
    const mockProvider = createMockProvider(async () => {
      return JSON.stringify([
        'Die Veranstaltung findet am {eventDate, date, long} statt.'
      ]);
    });

    const result = await translateArray(
      mockProvider,
      pluginParams,
      ['The event is on {eventDate, date, long}.'],
      'en',
      'de'
    );

    expect(result[0]).toContain('{eventDate, date, long}');
  });

  it('should handle ICU time format messages', async () => {
    const mockProvider = createMockProvider(async () => {
      return JSON.stringify([
        'La reunión es a las {meetingTime, time, short}.'
      ]);
    });

    const result = await translateArray(
      mockProvider,
      pluginParams,
      ['The meeting is at {meetingTime, time, short}.'],
      'en',
      'es'
    );

    expect(result[0]).toContain('{meetingTime, time, short}');
  });

  it('should handle ICU selectordinal messages', async () => {
    const mockProvider = createMockProvider(async () => {
      return JSON.stringify([
        'C\'est votre {place, selectordinal, one {#er} two {#ème} few {#ème} other {#ème}} essai.'
      ]);
    });

    const result = await translateArray(
      mockProvider,
      pluginParams,
      ['This is your {place, selectordinal, one {#st} two {#nd} few {#rd} other {#th}} try.'],
      'en',
      'fr'
    );

    expect(result[0]).toContain('{place, selectordinal,');
  });

  it('should handle multiple ICU messages in one string', async () => {
    const mockProvider = createMockProvider(async () => {
      return JSON.stringify([
        '{name} tiene {count, plural, =0 {sin artículos} =1 {un artículo} other {# artículos}} en {status, select, cart {carrito} wishlist {lista de deseos} other {otra ubicación}}.'
      ]);
    });

    const result = await translateArray(
      mockProvider,
      pluginParams,
      ['{name} has {count, plural, =0 {no items} =1 {one item} other {# items}} in {status, select, cart {cart} wishlist {wishlist} other {other location}}.'],
      'en',
      'es'
    );

    expect(result[0]).toContain('{count, plural,');
    expect(result[0]).toContain('{status, select,');
    expect(result[0]).toContain('{name}');
  });

  it('should handle mixed placeholder types correctly', async () => {
    const mockProvider = createMockProvider(async (prompt: string) => {
      // Double brace placeholders should be tokenized
      expect(prompt).toContain('⟦PH_0⟧');
      // Printf-style should be tokenized
      expect(prompt).toContain('⟦PH_1⟧');
      // ICU messages should NOT be tokenized
      expect(prompt).toContain('{count, plural,');
      
      return JSON.stringify([
        'Bonjour ⟦PH_0⟧! Message ⟦PH_1⟧: Vous avez {count, plural, =0 {aucune notification} other {# notifications}}.'
      ]);
    });

    const result = await translateArray(
      mockProvider,
      pluginParams,
      ['Hello {{username}}! Message %s: You have {count, plural, =0 {no notifications} other {# notifications}}.'],
      'en',
      'fr'
    );

    // All placeholders should be restored
    expect(result[0]).toContain('{{username}}');
    expect(result[0]).toContain('%s');
    expect(result[0]).toContain('{count, plural,');
  });

  it('should handle edge case with simple placeholder that looks like ICU start', async () => {
    const mockProvider = createMockProvider(async () => {
      return JSON.stringify([
        'Utilisateur ⟦PH_0⟧ connecté'
      ]);
    });

    // This is NOT an ICU message (no ICU type keyword)
    const result = await translateArray(
      mockProvider,
      pluginParams,
      ['User {id} logged in'],
      'en',
      'fr'
    );

    // Simple placeholder should be restored
    expect(result[0]).toContain('{id}');
  });

  it('should not tokenize a placeholder with comma if it is an ICU message', async () => {
    const mockProvider = createMockProvider(async (prompt: string) => {
      console.log('Captured prompt:', prompt);
      // ICU messages should NOT be tokenized - the entire ICU structure should be preserved
      expect(prompt).toContain('{count, plural,');
      expect(prompt).toContain('=0 {no items}');
      expect(prompt).toContain('other {# items}');
      
      // Check if there are any PH tokens in the JSON array part (not the instruction)
      const jsonArrayMatch = prompt.match(/\[(.*)\]/s);
      if (jsonArrayMatch) {
        const arrayPart = jsonArrayMatch[0];
        console.log('Array part:', arrayPart);
        // The array part should not have tokens since we only have an ICU message
        expect(arrayPart).not.toContain('⟦PH_');
      }
      
      return JSON.stringify([
        'Sie haben {count, plural, =0 {keine Artikel} other {# Artikel}}.'
      ]);
    });

    const result = await translateArray(
      mockProvider,
      pluginParams,
      ['You have {count, plural, =0 {no items} other {# items}}.'],
      'en',
      'de'
    );

    // Verify the result has the ICU message intact
    expect(result[0]).toContain('{count, plural,');
    expect(result[0]).toContain('keine Artikel');
  });
});

describe('translateArray - Standard Placeholder Protection', () => {
  it('should tokenize and restore simple placeholders', async () => {
    const mockProvider = createMockProvider(async () => {
      return JSON.stringify(['Bonjour ⟦PH_0⟧']);
    });

    const result = await translateArray(
      mockProvider,
      pluginParams,
      ['Hello {name}'],
      'en',
      'fr'
    );

    expect(result[0]).toBe('Bonjour {name}');
  });

  it('should tokenize and restore double-brace placeholders', async () => {
    const mockProvider = createMockProvider(async () => {
      return JSON.stringify(['Bonjour ⟦PH_0⟧']);
    });

    const result = await translateArray(
      mockProvider,
      pluginParams,
      ['Hello {{username}}'],
      'en',
      'fr'
    );

    expect(result[0]).toBe('Bonjour {{username}}');
  });

  it('should tokenize and restore printf-style placeholders', async () => {
    const mockProvider = createMockProvider(async () => {
      return JSON.stringify(['Message ⟦PH_0⟧: ⟦PH_1⟧']);
    });

    const result = await translateArray(
      mockProvider,
      pluginParams,
      ['Message %s: %1$s'],
      'en',
      'fr'
    );

    expect(result[0]).toBe('Message %s: %1$s');
  });

  it('should tokenize and restore slug-style placeholders', async () => {
    const mockProvider = createMockProvider(async () => {
      return JSON.stringify(['Voir l\'article ⟦PH_0⟧']);
    });

    const result = await translateArray(
      mockProvider,
      pluginParams,
      ['See article :slug'],
      'en',
      'fr'
    );

    expect(result[0]).toBe('Voir l\'article :slug');
  });

  it('should NOT tokenize plugin template placeholders (they are replaced before translateArray)', async () => {
    // These template placeholders like {recordContext}, {fromLocale}, {toLocale}, {fieldValue}
    // are replaced by the prompt template system BEFORE content reaches translateArray.
    // This test verifies that IF they somehow reached translateArray, they would be tokenized
    // as simple placeholders (which is correct behavior, since they shouldn't be in user content).
    
    const mockProvider = createMockProvider(async () => {
      // They should be tokenized like simple placeholders
      return JSON.stringify(['Traduire ⟦PH_0⟧ de ⟦PH_1⟧ à ⟦PH_2⟧: ⟦PH_3⟧']);
    });

    const result = await translateArray(
      mockProvider,
      pluginParams,
      ['Translate {recordContext} from {fromLocale} to {toLocale}: {fieldValue}'],
      'en',
      'fr'
    );

    // They should be restored as simple placeholders (but in reality, they're replaced before this)
    expect(result[0]).toBe('Traduire {recordContext} de {fromLocale} à {toLocale}: {fieldValue}');
  });
});

