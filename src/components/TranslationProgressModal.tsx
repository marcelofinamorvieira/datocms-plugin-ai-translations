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
import { translateFieldValue } from '../utils/translation/TranslateField';
import { generateRecordContext } from '../utils/translation/TranslateField';
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
      
      // Show record ID in the message
      addProgressUpdate({
        recordIndex: i,
        recordId: record.id,
        status: 'processing',
        message: `Starting translation of record ID: ${record.id}`
      });
      
      try {
        // Check if the record has the source locale
        if (!hasKeyDeep(record as Record<string, unknown>, fromLocale)) {
          const errorMsg = `Record ID ${record.id} does not have the source locale '${fromLocale}'`;
          addProgressUpdate({
            recordIndex: i,
            recordId: record.id,
            status: 'error',
            message: errorMsg
          });
          continue;
        }
        
        // Get translatable fields for this record
        const translatableFields = Object.entries(record)
          .filter(([field]) => shouldTranslateField(field, record, fromLocale, fieldTypeDictionary))
          .map(([field]) => field);
        
        // Update with field count information
        addProgressUpdate({
          recordIndex: i,
          recordId: record.id,
          status: 'processing',
          message: `Found ${translatableFields.length} fields to translate in record ID: ${record.id}`
        });
        
        const translatedFields: Record<string, unknown> = {};
        
        // Translate each field with progress updates
        for (let fieldIndex = 0; fieldIndex < translatableFields.length; fieldIndex++) {
          const field = translatableFields[fieldIndex];
          
          // Update on field translation start
          addProgressUpdate({
            recordIndex: i,
            recordId: record.id,
            status: 'processing',
            message: `Translating field '${field}' (${fieldIndex + 1}/${translatableFields.length}) in record ID: ${record.id}`
          });
          
          translatedFields[field] = record[field];

          try {
            const fieldValue = (record[field] as Record<string, unknown>)[fromLocale];
            const fieldType = fieldTypeDictionary[field].editor;
            const fieldTypePrompt = prepareFieldTypePrompt(fieldType);
          
            // Translate the individual field
            const translatedValue = await translateFieldValue(
              fieldValue,
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

            (translatedFields[field] as Record<string, unknown>)[toLocale] = translatedValue;
            
            // Update on field translation completion
            addProgressUpdate({
              recordIndex: i,
              recordId: record.id,
              status: 'processing',
              message: `Completed field '${field}' (${fieldIndex + 1}/${translatableFields.length}) in record ID: ${record.id}`
            });
          } catch (fieldError) {
            // Handle field-level error
            addProgressUpdate({
              recordIndex: i,
              recordId: record.id,
              status: 'processing',
              message: `Error translating field '${field}': ${fieldError instanceof Error ? fieldError.message : String(fieldError)}`
            });
          }
        }
        
        // Update processing status for saving
        addProgressUpdate({
          recordIndex: i,
          recordId: record.id,
          status: 'processing',
          message: `Saving translated content for record ID: ${record.id}...`
        });

        await client.items.update(record.id, {
          ...translatedFields
        });

        // Update progress to 'completed'
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
   */
  function hasKeyDeep(obj: Record<string, unknown>, targetKey: string): boolean {
    if (!obj || typeof obj !== 'object') return false;
    
    if (Object.prototype.hasOwnProperty.call(obj, targetKey)) return true;
    
    return Object.values(obj).some(value => {
      if (typeof value === 'object' && value !== null) {
        return hasKeyDeep(value as Record<string, unknown>, targetKey);
      }
      return false;
    });
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
              Translating from <strong>{fromLocale}</strong> to <strong>{toLocale}</strong>
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
