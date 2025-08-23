import { ClaimDetectionOrchestrator } from '../application/claimDetectionOrchestrator.js';

/**
 * @deprecated Use ClaimDetectionOrchestrator directly instead
 * This class is kept for backward compatibility only
 */
export class ClaimDetector extends ClaimDetectionOrchestrator {
  constructor() {
    super();
    console.warn('ClaimDetector is deprecated. Use ClaimDetectionOrchestrator instead.');
  }
}