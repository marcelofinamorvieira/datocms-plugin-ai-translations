import { useState, useEffect, useRef } from 'react';
import { Canvas, Button, Spinner } from 'datocms-react-ui';
import type { RenderModalCtx } from 'datocms-plugin-sdk';
import type { buildClient } from '@datocms/cma-client-browser';
import type OpenAI from 'openai';
import {
  fetchRecordsWithPagination,
  buildFieldTypeDictionary,
  type DatoCMSRecordFromAPI,
  shouldTranslateField,
  prepareFieldTypePrompt
} from '../utils/translation/ItemsDropdownUtils';
import { buildDatoCMSClient, createOpenAIClient } from '../utils/clients';
import type { ctxParamsType } from '../entrypoints/Config/ConfigScreen';
import { translateFieldValue, generateRecordContext, findExactLocaleKey } from '../utils/translation/TranslateField';
import './TranslationProgressModal.css';

interface ProgressUpdate {
  recordIndex: number;
  recordId: string;
  status: 'processing' | 'completed' | 'error';
  message?: string;
}

interface TranslationProgressModalProps {
  ctx: RenderModalCtx;
  parameters: {
    totalRecords: number;
    fromLocale: string;
    toLocale: string;
    accessToken: string;
    pluginParams: ctxParamsType;
    itemIds: string[];
  };
}

/**
 * Modal component that displays translation progress and handles the translation process.
 * Shows a progress bar, status updates for each record being translated,
 * and provides cancel/close actions.
 */
export default function TranslationProgressModal({ ctx, parameters }: TranslationProgressModalProps) {
  const { totalRecords, fromLocale, toLocale, accessToken, pluginParams, itemIds } = parameters;
  const [progress, setProgress] = useState<ProgressUpdate[]>([]);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isCancelled, setIsCancelled] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Use a ref to track if we've started the translation process
  const hasStartedTranslation = useRef(false);

  // Function to add a progress update
  const addProgressUpdate = (update: ProgressUpdate) => {
    setProgress(prev => {
      // Filter out previous updates for the same record and create a new array
      const filteredUpdates = prev.filter(p => p.recordIndex !== update.recordIndex);
      return [...filteredUpdates, update];
    });

    // Collect errors but don't change processing state
    if (update.status === 'error') {
      // Removed the setErrors call here
    }
  };
  
  // Handle the translation process
  useEffect(() => {
    let isMounted = true;
    
    const processTranslation = async () => {
      // Don't start if already processing, completed, unmounted, or already started
      if (isProcessing || isCompleted || !isMounted || hasStartedTranslation.current) return;
      
      // Mark as started to prevent future runs
      hasStartedTranslation.current = true;
      setIsProcessing(true);
      
      try {
        // Build DatoCMS client
        const client = buildDatoCMSClient(accessToken, ctx.environment);
        
        // Fetch all records with pagination
        const records = await fetchRecordsWithPagination(client, itemIds);
        
        // Create OpenAI client
        const openai = createOpenAIClient(pluginParams.apiKey);

        // Build a dictionary of field types for the first record's item type
        const fieldTypeDictionary = await buildFieldTypeDictionary(client, records[0].item_type.id);
        
        // Process and translate each record
        await translateRecords(records, client, openai, fromLocale, toLocale, fieldTypeDictionary);
        
      } catch (error) {
        if (isMounted) {
          // Removed the setErrors call here
          setIsProcessing(false);
        }
      }
    };
    
    processTranslation();
    
    return () => {
      isMounted = false;
    };
  }, [accessToken, fromLocale, toLocale, itemIds, pluginParams.apiKey, isProcessing, isCompleted, ctx.environment]);
  
  // Process and translate records with progress updates
  const translateRecords = async (
    records: DatoCMSRecordFromAPI[],
    client: ReturnType<typeof buildClient>,
    openai: OpenAI,
    fromLocale: string,
    toLocale: string,
    fieldTypeDictionary: Record<string, { editor: string; id: string; isLocalized: boolean }>
  ) => {
    for (let i = 0; i < records.length; i++) {
      if (isCancelled) {
        addProgressUpdate({
          recordIndex: i,
          recordId: records[i].id,
          status: 'error',
          message: 'Translation cancelled by user'
        });
        return;
      }
      
      const record = records[i];
      
      addProgressUpdate({
        recordIndex: i,
        recordId: record.id,
        status: 'processing',
        message: `Starting translation of record ID: ${record.id}`
      });
      
      try {
        if (!hasKeyDeep(record as Record<string, unknown>, fromLocale)) {
          const errorMsg = `Record ID ${record.id} does not have the source locale '${formatLocaleDisplay(fromLocale)}'`;
          addProgressUpdate({ recordIndex: i, recordId: record.id, status: 'error', message: errorMsg });
          continue;
        }
        
        const translatableFields = Object.entries(record)
          .filter(([field]) => shouldTranslateField(field, record, fromLocale, fieldTypeDictionary))
          .map(([field]) => field);
        
        addProgressUpdate({
          recordIndex: i,
          recordId: record.id,
          status: 'processing',
          message: `Found ${translatableFields.length} fields to translate in record ID: ${record.id}`
        });
        
        const payloadForUpdate: Record<string, unknown> = {};
        
        // Step 1: Translate the "translatable" fields
        for (const field of translatableFields) {
          const currentLocalizedData = (record[field] as Record<string, unknown>) || {};
          // Initialize with existing data for this field to preserve other locales.
          payloadForUpdate[field] = { ...currentLocalizedData };

          addProgressUpdate({
            recordIndex: i,
            recordId: record.id,
            status: 'processing',
            message: `Translating field '${field}' (${translatableFields.indexOf(field) + 1}/${translatableFields.length}) in record ID: ${record.id}`
          });

          try {
            // Find the exact locale key that matches fromLocale (case-insensitive)
            const exactFromLocaleKey = findExactLocaleKey(currentLocalizedData, fromLocale);
            const sourceValue = exactFromLocaleKey ? currentLocalizedData[exactFromLocaleKey] : undefined;

            if (sourceValue === null || sourceValue === undefined || sourceValue === '') {
              (payloadForUpdate[field] as Record<string, unknown>)[toLocale] = null;
              addProgressUpdate({
                recordIndex: i,
                recordId: record.id,
                status: 'processing',
                message: `Field '${field}' is null/empty in source, setting to null in target for record ID: ${record.id}`
              });
            } else {
              const fieldType = fieldTypeDictionary[field].editor;
              const fieldTypePrompt = prepareFieldTypePrompt(fieldType);
              const translatedValue = await translateFieldValue(
                sourceValue,
                pluginParams,
                toLocale,
                fromLocale,
                fieldType,
                openai,
                fieldTypePrompt,
                accessToken,
                fieldTypeDictionary[field].id,
                ctx.environment,
                undefined,
                generateRecordContext(record as Record<string, unknown>, fromLocale)
              );
              (payloadForUpdate[field] as Record<string, unknown>)[toLocale] = translatedValue;
              addProgressUpdate({
                recordIndex: i,
                recordId: record.id,
                status: 'processing',
                message: `Completed field '${field}' (${translatableFields.indexOf(field) + 1}/${translatableFields.length}) in record ID: ${record.id}`
              });
            }
          } catch (fieldError) {
            (payloadForUpdate[field] as Record<string, unknown>)[toLocale] = null; // Set to null on error
            addProgressUpdate({
              recordIndex: i,
              recordId: record.id,
              status: 'processing', // Keep as processing, error is field-specific
              message: `Error translating field '${field}' for record ID ${record.id}: ${fieldError instanceof Error ? fieldError.message : String(fieldError)}. Setting to null.`
            });
          }
        }
        
        // Step 2: Ensure all localized fields (from schema) are in the payload with the target locale.
        for (const fieldApiKey in fieldTypeDictionary) {
          if (fieldTypeDictionary[fieldApiKey].isLocalized) {
            if (!payloadForUpdate[fieldApiKey]) {
              // This localized field was not in translatableFields (e.g. empty in source, or not on record yet).
              // Initialize it with its existing data (if any from original record) and add toLocale: null.
              payloadForUpdate[fieldApiKey] = {
                ...((record[fieldApiKey] as Record<string, unknown>) || {}), // Start with existing locales of this field from the record
              };
              // Explicitly set toLocale to null if not already processed
              if (!(toLocale in (payloadForUpdate[fieldApiKey] as Record<string, unknown>))) {
                (payloadForUpdate[fieldApiKey] as Record<string, unknown>)[toLocale] = null;
              }
            } else {
              // Field was in translatableFields. Ensure toLocale key is present (should be by now).
              // This is a safeguard.
              if (!(toLocale in (payloadForUpdate[fieldApiKey] as Record<string, unknown>))) {
                (payloadForUpdate[fieldApiKey] as Record<string, unknown>)[toLocale] = null;
              }
            }
          }
        }
        
        addProgressUpdate({
          recordIndex: i,
          recordId: record.id,
          status: 'processing',
          message: `Saving translated content for record ID: ${record.id}...`
        });

        await client.items.update(record.id, payloadForUpdate);

        addProgressUpdate({
          recordIndex: i,
          recordId: record.id,
          status: 'completed',
          message: `Successfully translated ${translatableFields.length} fields in record ID: ${record.id}`
        });
      } catch (error) {
        addProgressUpdate({
          recordIndex: i,
          recordId: records[i].id,
          status: 'error',
          message: `Translation failed for record ID ${records[i].id}. This issue likely happened because the record is already in an invalid state.`
        });
        // Process will naturally continue to the next record
      }
    }
  };
  
  /**
   * Checks if an object has a specific key (including in nested objects)
   * Supports both regular locale codes and hyphenated locales (e.g., "pt-br")
   */
  function hasKeyDeep(obj: Record<string, unknown>, targetKey: string): boolean {
    if (!obj || typeof obj !== 'object') return false;

    // Use findExactLocaleKey for the direct match check
    if (findExactLocaleKey(obj, targetKey)) {
      return true;
    }

    // Recursive check in nested objects
    return Object.values(obj).some(value => {
      if (typeof value === 'object' && value !== null) {
        return hasKeyDeep(value as Record<string, unknown>, targetKey);
      }
      return false;
    });
  }

  // Using findExactLocaleKey imported from TranslateField.ts

  /**
   * Formats a locale code for display, using the Intl API when possible
   * Handles hyphenated locales like "pt-BR" correctly
   */
  function formatLocaleDisplay(localeCode: string): string {
    try {
      // Get the primary language code (e.g., "pt" from "pt-BR")
      const primaryLanguage = localeCode.split('-')[0];

      // Try to get a nice display name for the language part
      const localeMapper = new Intl.DisplayNames(['en'], { type: 'language' });
      const languageName = localeMapper.of(primaryLanguage);

      if (localeCode.includes('-')) {
        // If it's a hyphenated locale, show both the language name and the region code
        const regionCode = localeCode.split('-')[1];
        return `${languageName} (${regionCode})`;
      }

      return languageName || localeCode;
    } catch (error) {
      // Fallback if Intl API fails
      return localeCode;
    }
  }

  // Calculate completed counts correctly considering all processed records (completed or error)
  const processedRecords = Object.values(
    progress.reduce((uniqueRecords, update) => {
      uniqueRecords[update.recordIndex] = update;
      return uniqueRecords;
    }, {} as Record<number, ProgressUpdate>)
  );
  
  const completedCount = processedRecords.filter(update => 
    update.status === 'completed' || update.status === 'error'
  ).length;
    
  const percentComplete = totalRecords > 0 ? Math.round((completedCount / totalRecords) * 100) : 0;
  
  // Make sure to set completed state when all records are processed
  useEffect(() => {
    if (completedCount === totalRecords && totalRecords > 0) {
      setIsCompleted(true);
      setIsProcessing(false);
    }
  }, [completedCount, totalRecords]);
  
  const handleClose = () => {
    ctx.resolve({ completed: isCompleted, progress });
  };
  
  const handleCancel = () => {
    setIsCancelled(true);
    ctx.resolve({ completed: false, canceled: true });
  };
  
  return (
    <Canvas ctx={ctx}>
      <div className="TranslationProgressModal">
        <div className="TranslationProgressModal__header">
          <h2>Translating Records</h2>
          <div className="TranslationProgressModal__languages">
            <p>
              Translating from <strong>{formatLocaleDisplay(fromLocale)}</strong> to <strong>{formatLocaleDisplay(toLocale)}</strong>
            </p>
            <p className="TranslationProgressModal__progress-text">
              Progress: {completedCount} of {totalRecords} records processed ({percentComplete}%)
            </p>
            <p className="TranslationProgressModal__stats">
              {processedRecords.filter(update => update.status === 'completed').length} successful, {' '}
              {processedRecords.filter(update => update.status === 'error').length} failed
            </p>
          </div>
        </div>
        
        {/* Progress bar */}
        <div className="TranslationProgressModal__progress-bar">
          <div 
            className="TranslationProgressModal__progress-bar-fill"
            style={{width: `${percentComplete}%`}}
          />
        </div>
        
        {/* Progress list */}
        <div className="TranslationProgressModal__updates">
          {progress.length > 0 ? (
            <ul className="TranslationProgressModal__update-list">
              {progress.sort((a, b) => a.recordIndex - b.recordIndex).map((update) => (
                <li 
                  key={`${update.recordIndex}-${update.message}`}
                  className={`TranslationProgressModal__update-item TranslationProgressModal__update-item--${update.status}`}
                >
                  <span className="TranslationProgressModal__update-status">
                    {update.status === 'completed' && '✓'}
                    {update.status === 'processing' && <Spinner size={16} />}
                    {update.status === 'error' && '✗'}
                  </span>
                  <span className="TranslationProgressModal__update-message">
                    {update.message}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="TranslationProgressModal__initializing">
              <div className="TranslationProgressModal__spinner-container">
                <Spinner size={20} />
                <span>Initializing translation...</span>
              </div>
            </div>
          )}
        </div>
        
        <div className="TranslationProgressModal__footer">
          {!isCompleted && isProcessing && (
            <Button 
              type="button" 
              buttonType="negative" 
              onClick={handleCancel}
              buttonSize="s"
            >
              Cancel
            </Button>
          )}
          <Button 
            type="button" 
            buttonType="primary" 
            onClick={handleClose}
            disabled={isProcessing && !isCompleted}
            buttonSize="s"
          >
            {isCompleted ? 'Close' : isProcessing ? 'Please wait...' : 'Close'}
          </Button>
        </div>
      </div>
    </Canvas>
  );
}