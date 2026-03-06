import type { ChainInfo } from "../types";

interface Props {
  chains: ChainInfo[];
}

const LINE_WIDTH = 10;

export default function SequenceCard({ chains }: Props) {
  return (
    <div className="sequence-card">
      <p className="panel-title">Sequence</p>
      {chains.map((chain) => {
        const lines: { pos: number; residues: string }[] = [];
        for (let i = 0; i < chain.sequence.length; i += LINE_WIDTH) {
          lines.push({ pos: i + 1, residues: chain.sequence.slice(i, i + LINE_WIDTH) });
        }
        return (
          <div key={chain.id} className="sequence-chain">
            <div className="sequence-chain__header">
              <span className="sequence-chain__id">Chain {chain.id}</span>
              <span className="sequence-chain__len">{chain.sequence.length} aa</span>
            </div>
            <div className="sequence-body">
              {lines.map(({ pos, residues }) => (
                <div key={pos} className="sequence-line">
                  <span className="sequence-pos">{pos}</span>
                  <span className="sequence-residues">{residues}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
