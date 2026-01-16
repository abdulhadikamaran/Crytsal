export type View = 'dashboard' | 'playground' | 'models' | 'settings' | 'journey';

export enum PipelineStage {
  AtomicDeconstruction = 'Atomic Deconstruction',
  TemporalResolution = 'Temporal Resolution',
  StyleNormalization = 'Style Normalization',
  StructuralReorg = 'Structural Reorg',
  DetailManagement = 'Detail Management',
  RelationshipEnhance = 'Relationship Enhance',
  RedundancyElim = 'Redundancy Elim',
  CognitiveOpt = 'Cognitive Optimization',
  FinalSynthesis = 'Narrative Synthesis',
}

export type ReconstructionMode = 'Crystal Architecture 3.0';

export interface ModelConfig {
  id: string;
  name: string;
  type: ReconstructionMode;
  size: string;
  capabilities: string[];
  status: 'active' | 'downloading' | 'ready' | 'not_downloaded';
  progress: number;
}

export interface CorrectionResult {
  original: string;
  corrected: string;
  stats: {
    detailsPreserved: number; // percentage
    toneMatch: number; // percentage
    readabilityScore: number;
    processingTime: number; // ms
  };
}

export interface ProcessingStep {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'complete';
  duration?: number;
}