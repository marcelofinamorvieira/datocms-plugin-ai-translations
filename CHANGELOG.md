# Changelog

All notable changes to the DatoCMS AI Translations Plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.7.0] - 2025-03-19

### Added

- **Comprehensive Documentation**: Added detailed JSDoc comments throughout the codebase
  - Enhanced all translation utility files with clear documentation
  - Added parameter and return type descriptions
  - Included function purpose explanations and code examples
  - Documented interfaces and type definitions

- **Array Length Recovery Mechanism**: Added sophisticated handling for array mismatches in structured text translation
  - Created `ensureArrayLengthsMatch` utility function to preserve array structure
  - Implemented fallback strategies when translated arrays don't match original length
  - Added detailed logging for array adjustments

### Changed

- **Improved Structured Text Translation**: Enhanced the structured text translation process
  - Redesigned translation prompts with clearer, more explicit instructions
  - Added response text cleanup to handle markdown code blocks
  - Improved error handling with detailed logging
  - Implemented graceful recovery for translation issues

- **Enhanced Prompting System**: Improved the AI prompting strategy
  - Used template literals for better string formatting
  - Made array length requirements explicit in prompts
  - Added detailed instructions for preserving empty strings and whitespace

### Fixed

- Fixed TypeScript errors in `TranslateField.ts` related to parameter type mismatches
- Resolved linting issues throughout the codebase
- Fixed error handling in JSON parsing for structured text translations
- Improved error recovery to prevent translation failures on minor issues

### Developer Notes

- The array length recovery feature significantly improves reliability for structured text fields
- All major utility files now have comprehensive documentation for better maintainability
- Linting improvements create a more consistent codebase

## [1.6.0] - 2025-03-18

### Added

- **Cancel Translation Feature**: Added a "Cancel" button to the sidebar translation process, allowing users to abort translations while they're in progress
  - Implemented real-time cancellation using AbortController to immediately terminate API requests
  - Added visual indicators showing cancellation status
  - Includes graceful error handling for cancelled operations

- **Record Context Generator**: Added a sophisticated context generation system that extracts relevant information from other fields in the record
  - Provides better context for translations, improving accuracy and relevance
  - Automatically detects and includes key content from the record
  - Passes context to the LLM to create more coherent translations across the entire record

- **Debug Logging Toggle**: Added a boolean toggle in the plugin configuration for enabling/disabling debug logging
  - Positioned under the "Allow translation of the whole record" switch
  - Added helpful tooltip explaining its functionality
  - Allows administrators to control log verbosity for troubleshooting

### Changed

- **Enhanced Default Prompt**: Completely revised the default translation prompt for higher quality translations
  - Restructured format with clear sections for translation requirements, context utilization, and output instructions
  - Made the prompt more format-agnostic to work effectively across all field types
  - Added better prompting for context-aware translations using record details
  - Improved instructions for preserving original formatting

### Fixed

- Various code improvements and refactorings for better maintainability
- Enhanced typing in StreamCallbacks to improve type safety

### Developer Notes

- The new cancellation feature required significant changes to the translation process chain
- The recordContext system intelligently samples content from other fields to provide better translation context
- The logging system now completely respects the enableDebugging configuration parameter
