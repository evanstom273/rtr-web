import type { Hit } from '../storage/greatestHits';
import { starsShort } from './format';

export function GreatestHits({ hits, title }: { hits: Hit[]; title: string }) {
  if (!hits.length) return null;
  return (
    <>
      <h3>{title}</h3>
      <ol>
        {hits.map((x, i) => (
          <li key={i}>
            <span className="hs">{starsShort(x.stars)}★</span>
            <span className="hm">
              {x.you} vs {x.them}
              <br />
              <span className="hd">
                {x.how} · {x.venue}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </>
  );
}
