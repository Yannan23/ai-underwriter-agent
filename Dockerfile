# Day-1 image: run TypeScript directly via tsx. A bundled dist build (smaller
# image, faster cold start) is a deliberate Day-2 optimisation — see day1-build-plan.md.
FROM node:22-alpine
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps ./apps
COPY fixtures ./fixtures
# HUSKY=0: the root "prepare" script would otherwise fail — no .git in the image.
RUN HUSKY=0 pnpm install --frozen-lockfile

ENV NODE_ENV=production
EXPOSE 3000
CMD ["pnpm", "--filter", "@prism/api", "start"]
