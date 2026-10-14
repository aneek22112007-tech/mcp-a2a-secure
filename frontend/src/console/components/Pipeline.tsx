import { PIPELINE_STAGES, type StageLight } from './pipelineLogic';

export function PipelineStrip({ lights }: { lights: StageLight[] }) {
  return (
    <div className="pipeline" role="list" aria-label="Request pipeline">
      {PIPELINE_STAGES.map((name, index) => (
        <div key={name} className="pipeline-step" role="listitem">
          <span className={`pipeline-node pipeline-${lights[index] ?? 'idle'}`}>{name}</span>
          {index < PIPELINE_STAGES.length - 1 && (
            <span className={`pipeline-join ${lights[index] === 'passed' ? 'pipeline-join-lit' : ''}`} aria-hidden />
          )}
        </div>
      ))}
    </div>
  );
}
