# List recipes
default:
    @just --list

# Install dependencies
setup:
    npm install

# Run the test suite
test *args:
    npx vitest run {{args}}

# Typecheck everything
check:
    npx tsc --noEmit

# Serve the site with live reload
dev:
    npx vite

# Build the static site into dist/web
build:
    npm run build

# Serve the built site, as it would be hosted
preview: build
    npx vite preview

# Redraw the style images in media/styles from the git example
styles:
    node scripts/styles.ts

# Lint and check formatting
lint:
    npm run lint

# Format everything
format:
    npm run format
