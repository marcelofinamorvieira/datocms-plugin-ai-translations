import type { RenderPageCtx } from 'datocms-plugin-sdk';
import { Canvas, SelectField, Button, Spinner } from 'datocms-react-ui';
import { useEffect, useState } from 'react';
import { buildDatoCMSClient } from '../../utils/clients';
import type { ctxParamsType } from '../../entrypoints/Config/ConfigScreen';
import '../styles.module.css';
// Light local equivalents of react-select types to avoid adding the package
type SingleValue<T> = T | null;
type MultiValue<T> = readonly T[];

type PropTypes = {
  ctx: RenderPageCtx;
};

type ModelOption = {
  label: string;
  value: string;
};

type LocaleOption = {
  label: string;
  value: string;
};

interface TranslationModalResult {
  completed?: boolean;
  canceled?: boolean;
}

export default function AIBulkTranslationsPage({ ctx }: PropTypes) {
  const [models, setModels] = useState<ModelOption[]>([]);
  const [selectedModels, setSelectedModels] = useState<ModelOption[]>([]);
  const [locales, setLocales] = useState<LocaleOption[]>([]);
  const [sourceLocale, setSourceLocale] = useState<LocaleOption | null>(null);
  const [targetLocale, setTargetLocale] = useState<LocaleOption | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      if (!ctx.currentUserAccessToken) {
        ctx.alert('No access token found');
        setIsLoading(false);
        return;
      }

      try {
        const client = buildDatoCMSClient(ctx.currentUserAccessToken, ctx.environment);
        
        const itemTypes = await client.itemTypes.list() 

        const nonBlockModels = itemTypes.filter(model => 
          !model.modular_block
        );
        
        const modelOptions = nonBlockModels.map(model => ({
          label: model.name,
          value: model.id
        }));
        
        setModels(modelOptions);
        
        const site = await client.site.find() 
        const localeOptions = site.locales.map((locale: string) => ({
          label: locale,
          value: locale
        }));
        
        setLocales(localeOptions);
        
        if (localeOptions.length > 0) {
          setSourceLocale(localeOptions[0]);
        }
        
        setIsLoading(false);
      } catch (error) {
        console.error('Error loading data:', error);
        ctx.alert(`Error loading data: ${error instanceof Error ? error.message : String(error)}`);
        setIsLoading(false);
      }
    }
    
    loadData();
  }, [ctx]);

  const startTranslation = async () => {
    if (!sourceLocale || !targetLocale || selectedModels.length === 0) {
      ctx.alert('Please select source locale, target locale, and at least one model');
      return;
    }
    
    if (sourceLocale.value === targetLocale.value) {
      ctx.alert('Source and target locales must be different');
      return;
    }

    if (!ctx.currentUserAccessToken) {
      ctx.alert('No access token found');
      return;
    }
    
    const pluginParams = ctx.plugin.attributes.parameters as ctxParamsType;
    if (!pluginParams.apiKey) {
      ctx.alert('Please configure your API key in the plugin settings');
      return;
    }

    try {
      const client = buildDatoCMSClient(ctx.currentUserAccessToken, ctx.environment);
      const allRecordIds: string[] = [];
      
      setIsLoading(true);
      
      for (const model of selectedModels) {
        const recordsIterator = client.items.listPagedIterator({
          filter: {
            type: model.value,
          },
          version: 'current',
          nested: true
        });
        
        for await (const record of recordsIterator) {
          allRecordIds.push(record.id);
        }
      }
      
      setIsLoading(false);
      
      if (allRecordIds.length === 0) {
        ctx.alert('No records found in the selected models');
        return;
      }
      
      const modalPromise = ctx.openModal({
        id: 'translationProgressModal',
        title: 'Translation Progress',
        width: 'l',
        parameters: {
          totalRecords: allRecordIds.length,
          fromLocale: sourceLocale.value,
          toLocale: targetLocale.value,
          accessToken: ctx.currentUserAccessToken,
          pluginParams,
          itemIds: allRecordIds
        }
      });
      
      try {
        const result = await modalPromise as TranslationModalResult;
        
        if (result?.completed) {
          ctx.notice(`Successfully translated ${allRecordIds.length} record(s) from ${sourceLocale.value} to ${targetLocale.value}`);
        } else if (result?.canceled) {
          ctx.notice(`Translation from ${sourceLocale.value} to ${targetLocale.value} was canceled`);
        }
      } catch (error) {
        ctx.alert(`Error: ${error instanceof Error ? error.message : String(error)}`);
      }
    } catch (error) {
      setIsLoading(false);
      ctx.alert(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleSourceLocaleChange = (newValue: SingleValue<LocaleOption> | MultiValue<LocaleOption>) => {
    if (newValue && !Array.isArray(newValue)) {
      setSourceLocale(newValue as LocaleOption);
    }
  };

  const handleTargetLocaleChange = (newValue: SingleValue<LocaleOption> | MultiValue<LocaleOption>) => {
    if (newValue && !Array.isArray(newValue)) {
      setTargetLocale(newValue as LocaleOption);
    }
  };

  const handleModelChange = (newValue: SingleValue<ModelOption> | MultiValue<ModelOption>) => {
    if (Array.isArray(newValue)) {
      setSelectedModels([...newValue]);
    }
  };

  return (
    <Canvas ctx={ctx}>
      <div style={{ 
        minHeight: 'calc(100vh - 100px)', /* Account for any Canvas header/footer */
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        alignItems: 'center',
        padding: '80px 20px 20px 20px'
      }}>
        <div style={{ 
          width: '100%',
          maxWidth: '800px',
          background: 'white', 
          borderRadius: '8px', 
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
          padding: '24px',
          marginBottom: '20px'
        }}>
          <div style={{ textAlign: 'center', marginBottom: '20px', borderBottom: '1px solid #eee', paddingBottom: '16px' }}>
            <h1 style={{ fontSize: '24px', marginBottom: '8px' }}>AI Bulk Translations</h1>
            <p style={{ color: '#666', marginBottom: '0px' }}>Select languages and models to perform bulk translations.</p>
          </div>

          {isLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '30px' }}>
              <div>
                <Spinner size={40} />
                <p style={{ marginTop: '16px', color: '#666' }}>Loading languages and models...</p>
              </div>
            </div>
          ) : (
            <div>
              {/* Language selectors in the same row with a more compact design */}
              <div style={{ 
                display: 'flex', 
                gap: '16px', 
                justifyContent: 'space-between',
                marginBottom: '20px',
                padding: '16px',
                background: '#f9f9f9',
                borderRadius: '6px'
              }}>
                <div style={{ flex: 1 }}>
                  <SelectField
                    name="sourceLocale"
                    id="sourceLocale"
                    label="Source Language"
                    hint="Translate from"
                    value={sourceLocale}
                    selectInputProps={{
                      options: locales,
                    }}
                    onChange={handleSourceLocaleChange}
                  />
                </div>
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  color: '#666',
                  marginTop: '24px'
                }}>
                  <div style={{ fontWeight: 'bold', fontSize: '18px' }}>→</div>
                </div>
                <div style={{ flex: 1 }}>
                  <SelectField
                    name="targetLocale"
                    id="targetLocale"
                    label="Target Language"
                    hint="Translate to"
                    value={targetLocale}
                    selectInputProps={{
                      options: locales.filter(locale => locale.value !== sourceLocale?.value),
                    }}
                    onChange={handleTargetLocaleChange}
                  />
                </div>
              </div>

              {/* Models selector with improved styling */}
              <div style={{ 
                marginBottom: '24px',
                padding: '16px',
                background: '#f9f9f9',
                borderRadius: '6px'
              }}>
                <SelectField
                  name="selectedModels"
                  id="selectedModels"
                  label="Models to Translate"
                  hint="Select one or more models to translate"
                  value={selectedModels}
                  selectInputProps={{
                    isMulti: true,
                    options: models,
                  }}
                  onChange={handleModelChange}
                />
                {selectedModels.length > 0 && (
                  <div style={{ marginTop: '10px', fontSize: '14px', color: '#666' }}>
                    Selected {selectedModels.length} {selectedModels.length === 1 ? 'model' : 'models'}
                  </div>
                )}
              </div>

              {/* Action button with improved styling */}
              <div style={{ marginTop: '24px' }}>
                <Button 
                  buttonType="primary" 
                  onClick={startTranslation}
                  disabled={!sourceLocale || !targetLocale || selectedModels.length === 0}
                  fullWidth
                  style={{ padding: '12px', fontSize: '16px' }}
                >
                  Start Bulk Translation
                </Button>
                
                {/* Additional helpful text */}
                {(sourceLocale && targetLocale && selectedModels.length > 0) && (
                  <div style={{ marginTop: '10px', fontSize: '13px', color: '#666', textAlign: 'center' }}>
                    Ready to translate from {sourceLocale.label} to {targetLocale.label}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        
        {/* Info footer */}
        <div style={{ textAlign: 'center', fontSize: '13px', color: '#666', marginTop: '0', width: '100%', maxWidth: '800px' }}>
          Translations are performed using AI. Review content after translation.
        </div>
      </div>
    </Canvas>
  );
}
/**
 * AIBulkTranslationsPage.tsx
 * Custom settings page that lets admins run bulk translations across models.
 * Uses the CMA client from the current user token and opens a modal to track progress.
 * This page is only visible to users with schema permissions (see main.tsx settings menu).
 */
