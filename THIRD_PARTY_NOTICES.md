# Third-party components

The self-contained server bundle includes these dependencies and their transitive dependencies. License notices are preserved by esbuild at the end of `server/dist/cli.mjs`.

The full bundled dependency licenses are in [`assets/THIRD_PARTY_LICENSES.txt`](assets/THIRD_PARTY_LICENSES.txt). `@nodable/entities@3.1.0` omits its license file from the npm tarball; [`assets/licenses/nodable-entities-3.1.0-MIT.txt`](assets/licenses/nodable-entities-3.1.0-MIT.txt) preserves the upstream MIT license from [nodable/val-parsers at b89ecb0](https://github.com/nodable/val-parsers/blob/b89ecb0d419969e2989b74c5304bc9b66931727e/LICENSE). The build fails if a bundled dependency has no full redistribution license.

- `@modelcontextprotocol/sdk` — MIT, Anthropic PBC. [Source](https://github.com/modelcontextprotocol/typescript-sdk).
- `fast-xml-parser` — MIT, Natural Intelligence / Amit Kumar Gupta. [Source](https://github.com/NaturalIntelligence/fast-xml-parser).
- `ws` — MIT, Einar Otto Stangvik and contributors. [Source](https://github.com/websockets/ws).
- `zod` — MIT, Colin McDonnell. [Source](https://github.com/colinhacks/zod).

`assets/gradle-wrapper.jar` is the unmodified Gradle 9.3.1 wrapper, distributed under the Apache License 2.0 by Gradle, Inc. Its SHA-256 is `b3a875ddc1f044746e1b1a55f645584505f4a10438c1afea9f15e92a7c42ec13`. [Source](https://github.com/gradle/gradle/tree/v9.3.1), [license](https://github.com/gradle/gradle/blob/v9.3.1/LICENSE).

The Android SDK, Android emulator, system images, Java and Android/Compose libraries are separately installed tooling. They are not redistributed in the plugin. Their licenses remain their respective owners' licenses.

The upstream [Build iOS Apps plugin](https://github.com/openai/plugins/tree/main/plugins/build-ios-apps) informed the capability mapping. This is an independent Android implementation; it is not an OpenAI product or an official Android plugin.

## Android robot icon

`assets/icon.svg` and `viewer/icon.svg` are modified robot artwork with a custom outline, proportions and colors. They are covered by [Creative Commons Attribution 3.0](https://creativecommons.org/licenses/by/3.0/), rather than this repository's MIT license. See the [Android brand guidelines](https://developer.android.com/distribute/marketing-tools/brand-guidelines).

The Android robot is reproduced or modified from work created and shared by Google and used according to terms described in the Creative Commons 3.0 Attribution License.

Android is a trademark of Google LLC. No Google or OpenAI endorsement is implied.
