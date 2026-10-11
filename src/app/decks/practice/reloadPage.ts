// Its own module so a test can mock it: jsdom's `location.reload` cannot be replaced (#1104).
export const reloadPage = (): void => window.location.reload();
