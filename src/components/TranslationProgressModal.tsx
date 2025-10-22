import { useState, useEffect, useRef } from 'react';
import { Canvas, Button, Spinner } from 'datocms-react-ui';
import type { RenderModalCtx } from 'datocms-plugin-sdk';
// no direct types from OpenAI or buildClient needed here
import {
  fetchRecordsWithPagination,
  buildFieldTypeDictionary,
  translateAndUpdateRecords,
  type ProgressUpdate
} from '../utils/translation/ItemsDropdownUtils';
import { buildDatoCMSClient, createOpenAIClient } from '../utils/clients';
import type { ctxParamsType } from '../entrypoints/Config/ConfigScreen';
// findExactLocaleKey no longer needed here
import './TranslationProgressModal.css';

// ProgressUpdate type imported from ItemsDropdownUtils

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
  const abortRef = useRef<AbortController | null>(null);
  
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
      if (isProcessing || isCompleted || !isMounted || hasStartedTranslation.current) return;

      hasStartedTranslation.current = true;
      setIsProcessing(true);

      try {
        const client = buildDatoCMSClient(accessToken, ctx.environment);
        const records = await fetchRecordsWithPagination(client, itemIds);
        const openai = createOpenAIClient(pluginParams.apiKey);

        // Cache field dictionaries per item type
        const cache = new Map<string, Record<string, { editor: string; id: string; isLocalized: boolean }>>();
        const getFieldTypeDictionary = async (itemTypeId: string) => {
          if (!cache.has(itemTypeId)) {
            const dict = await buildFieldTypeDictionary(client, itemTypeId);
            cache.set(itemTypeId, dict);
          }
          return cache.get(itemTypeId)!;
        };

        // Prepare AbortController for in-flight cancellations
        const controller = new AbortController();
        abortRef.current = controller;

        await translateAndUpdateRecords(
          records,
          client,
          openai,
          fromLocale,
          toLocale,
          getFieldTypeDictionary,
          pluginParams,
          ctx,
          accessToken,
          {
            onProgress: addProgressUpdate,
            checkCancelled: () => isCancelled,
            abortSignal: controller.signal,
          }
        );
      } catch (_error) {
        if (isMounted) {
          setIsProcessing(false);
        }
      }
    };

    processTranslation();

    return () => {
      isMounted = false;
    };
  }, [accessToken, fromLocale, toLocale, itemIds, pluginParams.apiKey, isProcessing, isCompleted, ctx.environment, isCancelled]);
  
  // Translation handled by shared translateAndUpdateRecords utility
  
  // Translation progress updates handled via shared translator callbacks

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
    // Abort in-flight requests to stop streaming immediately
    abortRef.current?.abort();
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
              {progress
                .slice()
                .sort((a, b) => a.recordIndex - b.recordIndex)
                .map((update) => (
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
