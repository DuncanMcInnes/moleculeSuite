import type { ChainInfo } from "../types";

interface SelectedResidue { chainId: string; seqId: number }

interface Props {
  chains: ChainInfo[];
  selectedResidue: SelectedResidue | null;
  onResidueClick: (chainId: string, seqId: number) => void;
}

const LINE_WIDTH = 10;

export default function SequenceCard({ chains, selectedResidue, onResidueClick }: Props) {
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
                  <span className="sequence-residues">
                    {residues.split('').map((aa, idx) => {
                      const absIdx = pos - 1 + idx;
                      const seqId  = chain.seq_ids[absIdx];
                      const isSelected =
                        selectedResidue?.chainId === chain.id && selectedResidue?.seqId === seqId;
                      return (
                        <span
                          key={absIdx}
                          className={`sequence-aa${isSelected ? ' sequence-aa--selected' : ''}`}
                          onClick={() => onResidueClick(chain.id, seqId)}
                        >
                          {aa}
                        </span>
                      );
                    })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
