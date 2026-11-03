import { useBackLayer } from './backStack';
import { SKINS, setSkin, useSkin, type Skin } from './skin';

/** A tiny swatch of each skin, drawn in its own colours whatever skin is on now. */
function Swatch({ id }: { id: Skin }) {
  return (
    <span className={`sw sw-${id}`} aria-hidden>
      <i className="sw-a" />
      <i className="sw-b" />
      <i className="sw-c" />
      <b>{id === 'paper' ? 'Aa' : id === 'broadcast' ? '10:20' : '★'}</b>
    </span>
  );
}

export function Settings({ onClose }: { onClose: () => void }) {
  useBackLayer(true, onClose);
  const skin = useSkin();
  return (
    <div className="wheel-ov" onClick={onClose}>
      <div className="movepanel settings" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Settings">
        <div className="mp-head">
          <span />
          <h3>The look</h3>
          <button className="ghost sm" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="skins" role="radiogroup" aria-label="Skin">
          {SKINS.map((x) => (
            <button key={x.id} role="radio" aria-checked={skin === x.id} className={`skin-opt${skin === x.id ? ' on' : ''}`} onClick={() => setSkin(x.id)}>
              <Swatch id={x.id} />
              <span className="so-t">
                <b>{x.name}</b>
                <small>{x.blurb}</small>
              </span>
            </button>
          ))}
        </div>
        <p className="sp-help">Changes every screen straight away. The game remembers it.</p>
      </div>
    </div>
  );
}
