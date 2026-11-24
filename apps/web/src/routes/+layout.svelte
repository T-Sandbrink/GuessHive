<script lang="ts">
  import './layout.css';
  import { browser, dev } from '$app/env';
  import { afterNavigate } from '$app/navigation';
  import favicon from '#lib/assets/favicon.svg';
  import { startAnalytics, trackPageview } from '#lib/analytics.js';
  import type { LayoutProps } from './$types';

  let { children }: LayoutProps = $props();

  // Cookieless Vercel Web Analytics, production builds only (task 1.13).
  if (browser && !dev) {
    startAnalytics();
  }

  afterNavigate(({ to }) => {
    if (to) {
      trackPageview(to.route.id, to.url.pathname);
    }
  });
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
