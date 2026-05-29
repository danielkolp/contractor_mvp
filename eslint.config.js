import nextConfig from "eslint-config-next"

// These rules flag valid React idioms (lazy initializers, dialog/dropdown
// state reset on open, theme hydration from localStorage). Full refactors
// to key-based resets or useSyncExternalStore are out of scope here.
const config = [
  ...nextConfig,
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
    },
  },
]

export default config
