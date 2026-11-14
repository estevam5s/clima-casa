/** @type {import('next').NextConfig} */
const SISTEMA = process.env.NEXT_PUBLIC_SISTEMA_URL || 'https://app.zynio.com.br'

export default {
  poweredByHeader: false,
  images: { unoptimized: false },
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        { key: 'Content-Security-Policy', value: `default-src 'self'; img-src 'self' data: https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; frame-src https://challenges.cloudflare.com; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com${process.env.NODE_ENV === 'production' ? '' : " 'unsafe-eval'"}; font-src 'self'; connect-src 'self' ${SISTEMA} https://clima-casa-lac.vercel.app https://challenges.cloudflare.com; frame-ancestors 'none'` },
      ],
    }]
  },
}
