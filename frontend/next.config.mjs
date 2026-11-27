/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep the development server's chunks separate from `next build` output.
  // Both commands otherwise overwrite the same directory and can cause stale
  // manifest references and 404s for `/_next/static/*` while developing.
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
};

export default nextConfig;
