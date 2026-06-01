import { getFallbackOrigin } from "@/lib/failover";

/**
 * فحص فوري قبل تحميل React — تحويل سريع إلى Render عند تعطل Railway.
 */
export function FailoverBootstrap() {
  const fallback = getFallbackOrigin();
  if (!fallback) return null;

  const payload = JSON.stringify({ fallback });

  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `(function(){try{var d=${payload};var fb=d.fallback;if(!fb||location.origin===fb)return;if(sessionStorage.getItem("almonzel-failover-used")==="1")return;var c=new AbortController(),t=setTimeout(function(){c.abort()},4500);fetch("/api/health",{signal:c.signal,cache:"no-store"}).then(function(r){clearTimeout(t);if(r.status===402||r.status===403||r.status>=502)go();}).catch(go);function go(){sessionStorage.setItem("almonzel-failover-used","1");location.replace(fb+location.pathname+location.search);}}catch(e){}})();`,
      }}
    />
  );
}
