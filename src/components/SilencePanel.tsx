interface SilencePanelProps {
  enabled: boolean;
  thresholdDb: number;
  minSilence: number;
  candidateCount: number;
  onToggleEnabled: () => void;
  onThresholdChange: (db: number) => void;
  onMinSilenceChange: (sec: number) => void;
  onApplyAll: () => void;
}

/**
 * Controls for silence-based split suggestions: adjustable threshold and
 * minimum silence duration, live candidate count, one-click apply.
 */
export function SilencePanel(props: SilencePanelProps) {
  const { enabled, thresholdDb, minSilence, candidateCount } = props;

  return (
    <div className="silence-panel">
      <label className="silence-toggle" title="按静音中点给出章节切分建议（橙色虚线预览）">
        <input type="checkbox" checked={enabled} onChange={props.onToggleEnabled} />
        静音切分建议
      </label>
      {enabled && (
        <>
          <label className="silence-field">
            阈值
            <input
              type="range"
              min={-70}
              max={-20}
              step={1}
              value={thresholdDb}
              onChange={(e) => props.onThresholdChange(Number(e.target.value))}
            />
            <span className="silence-value">{thresholdDb} dB</span>
          </label>
          <label className="silence-field">
            最短静音
            <input
              type="range"
              min={0.3}
              max={3}
              step={0.1}
              value={minSilence}
              onChange={(e) => props.onMinSilenceChange(Number(e.target.value))}
            />
            <span className="silence-value">{minSilence.toFixed(1)} s</span>
          </label>
          <span className="silence-count">候选 {candidateCount} 处</span>
          <button
            className="primary"
            disabled={candidateCount === 0}
            onClick={props.onApplyAll}
            title="按全部候选边界切分空白区间（保留已有章节，不产生重叠）"
          >
            应用全部候选
          </button>
        </>
      )}
    </div>
  );
}
