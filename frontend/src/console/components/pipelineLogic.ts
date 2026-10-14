export const PIPELINE_STAGES = ['Auth', 'Scope', 'Rate limit', 'Pin gate', 'Audit', 'Sandbox'] as const;

export type StageLight = 'idle' | 'passed' | 'blocked';

function stageIndex(stage: string, httpStatus: number): number {
  const named = PIPELINE_STAGES.findIndex(name => stage === name);
  if (named >= 0) return named;
  if (httpStatus === 401) return 0;
  if (httpStatus === 429) return PIPELINE_STAGES.indexOf('Rate limit');
  if (httpStatus === 403) {
    return /pin/i.test(stage)
      ? PIPELINE_STAGES.indexOf('Pin gate')
      : PIPELINE_STAGES.indexOf('Scope');
  }
  return -1;
}

/** Light every stage up to the one this response reached. The reached stage stays lit. */
export function pipelineLights(stage: string, httpStatus: number): StageLight[] {
  if (httpStatus >= 200 && httpStatus < 300) {
    return PIPELINE_STAGES.map(() => 'passed');
  }
  const index = stageIndex(stage, httpStatus);
  if (index < 0) return PIPELINE_STAGES.map(() => 'idle');
  return PIPELINE_STAGES.map((_, i) => {
    if (i < index) return 'passed';
    if (i === index) return 'blocked';
    return 'idle';
  });
}

export function lightsMatched(lights: StageLight[]): boolean {
  return lights.some(light => light !== 'idle');
}
