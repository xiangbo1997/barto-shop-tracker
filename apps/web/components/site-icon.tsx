'use client';

import { useState } from 'react';
import { faviconUrl, siteInitial } from '../lib/format';

/** 来源站点图标：favicon 优先，失败回退到域名首字母。 */
export function SiteIcon({ sourceSite }: { sourceSite: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="site-icon" title={sourceSite}>
      {failed ? (
        siteInitial(sourceSite)
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={faviconUrl(sourceSite)} alt="" onError={() => setFailed(true)} loading="lazy" />
      )}
    </span>
  );
}
