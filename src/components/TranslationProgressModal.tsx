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
  const [errors, setErrors] = useState<string[]>([]);
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
      setErrors(prev => [...prev, update.message || 'An error occurred during translation']);
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
        const client = buildDatoCMSClient(accessToken);
        
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
          setErrors(prev => [...prev, `Translation error: ${error instanceof Error ? error.message : String(error)}`]);
          setIsProcessing(false);
        }
      }
    };
    
    processTranslation();
    
    return () => {
      isMounted = false;
    };
  }, [accessToken, fromLocale, toLocale, itemIds, pluginParams.apiKey, isProcessing, isCompleted]);
  
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
        const errorMessage = error instanceof Error ? error.message : String(error);
        addProgressUpdate({
          recordIndex: i,
          recordId: records[i].id,
          status: 'error',
          message: `Translation failed for record ID ${records[i].id}: ${errorMessage}. This issue likely happened because the record is already in an invalid state.`
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
      <div style={{ 
        padding: '24px', 
        maxWidth: '600px',
        margin: '0 auto',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center'
      }}>
        <h2 style={{ 
          marginTop: 0, 
          marginBottom: '16px', 
          fontSize: '21px',
          fontWeight: '600',
          color: '#333'
        }}>
          Translating Records
        </h2>
        
        <div style={{ marginBottom: '24px', width: '100%' }}>
          <p style={{ margin: '0 0 8px 0', fontSize: '15px' }}>
            Translating from <strong>{fromLocale}</strong> to <strong>{toLocale}</strong>
          </p>
          <p style={{ margin: '0', fontSize: '15px' }}>
            Progress: {completedCount} of {totalRecords} records processed ({percentComplete}%)
          </p>
          <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: '#666' }}>
            {processedRecords.filter(update => update.status === 'completed').length} successful, 
            {processedRecords.filter(update => update.status === 'error').length} failed
          </p>
        </div>
        
        {/* Progress bar */}
        <div 
          style={{
            height: '6px',
            width: '100%',
            backgroundColor: '#e8e8e8',
            borderRadius: '3px',
            marginBottom: '20px',
            overflow: 'hidden'
          }}
        >
          <div 
            style={{
              height: '100%',
              width: `${percentComplete}%`,
              backgroundColor: '#7357d2',
              transition: 'width 0.3s ease-in-out'
            }}
          />
        </div>
        
        {/* Progress list */}
        <div 
          style={{
            maxHeight: '180px',
            overflowY: 'auto',
            border: '1px solid #e8e8e8',
            borderRadius: '4px',
            marginBottom: '24px',
            backgroundColor: '#f9f9f9',
            width: '100%'
          }}
        >
          {progress.length > 0 ? (
            <ul style={{ margin: 0, padding: '8px', listStyleType: 'none' }}>
              {/* Show items sorted by record index to ensure consistent display order */}
              {[...progress].sort((a, b) => a.recordIndex - b.recordIndex).map((item) => (
                <li 
                  key={`${item.recordId}-${item.status}-${item.recordIndex}`}
                  style={{
                    padding: '8px',
                    borderBottom: '1px solid #e8e8e8',
                    display: 'flex',
                    alignItems: 'center',
                    fontSize: '14px',
                    color: '#444'
                  }}
                >
                  {item.status === 'processing' && (
                    <Spinner size={16} style={{ marginRight: '8px', color: '#7357d2' }} />
                  )}
                  {item.status === 'completed' && (
                    <span style={{ color: '#3cbc8d', marginRight: '8px', fontWeight: 'bold' }}>✓</span>
                  )}
                  {item.status === 'error' && (
                    <span style={{ color: '#e25444', marginRight: '8px', fontWeight: 'bold' }}>✗</span>
                  )}
                  <span>
                    Record {item.recordIndex + 1}: {item.message || (item.status === 'completed' ? 'Translated successfully' : 'Processing...')}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div style={{ padding: '24px', textAlign: 'center', color: '#666' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Spinner size={20} style={{ marginRight: '8px', color: '#7357d2' }} />
                <span>Initializing translation...</span>
              </div>
            </div>
          )}
        </div>
        
        {errors.length > 0 && (
          <div 
            style={{
              padding: '12px',
              backgroundColor: '#fdecea',
              color: '#e25444',
              borderRadius: '4px',
              marginBottom: '20px',
              fontSize: '14px',
              width: '100%',
              textAlign: 'left'
            }}
          >
            {errors.map((error, index) => (
              <p key={`error-${index}-${error.substring(0, 20)}`}>{error}</p>
            ))}
          </div>
        )}
        
        <div style={{ display: 'flex', justifyContent: 'center', width: '100%', gap: '16px' }}>
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
