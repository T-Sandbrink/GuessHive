<script lang="ts">
  import './layout.css';
  import { onMount } from 'svelte';
  import { PUBLIC_ANALYTICS_ENABLED } from '$app/env/public';
  import { afterNavigate } from '$app/navigation';
  import { page } from '$app/state';
  import favicon from '#lib/assets/favicon.svg';
  import { type AnalyticsPageData, startAnalytics, trackPageview } from '#lib/analytics.js';
  import type { LayoutProps } from './$types';

  let { children }: LayoutProps = $props();

  // Cookieless Vercel Web Analytics, only where explicitly enabled (Production; ADR 0005) and
  // only after opt-in consent (startAnalytics does nothing until the phase 3 banner grants it).
  if (PUBLIC_ANALYTICS_ENABLED) {
    onMount(() => {
      startAnalytics();
    });
    afterNavigate(({ to }) => {
      if (to) {
        trackPageview(to.route.id, to.url.pathname, page.data as AnalyticsPageData);
      }
    });
  }
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
