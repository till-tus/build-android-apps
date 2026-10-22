# Third-party components

The self-contained server bundle includes these dependencies and their transitive dependencies. License notices are preserved by esbuild at the end of `server/dist/cli.mjs`.

- `@modelcontextprotocol/sdk` — MIT, Anthropic PBC. [Source](https://github.com/modelcontextprotocol/typescript-sdk).
- `fast-xml-parser` — MIT, Natural Intelligence / Amit Kumar Gupta. [Source](https://github.com/NaturalIntelligence/fast-xml-parser).
- `ws` — MIT, Einar Otto Stangvik and contributors. [Source](https://github.com/websockets/ws).
- `zod` — MIT, Colin McDonnell. [Source](https://github.com/colinhacks/zod).

`assets/gradle-wrapper.jar` is the unmodified Gradle 9.3.1 wrapper, distributed under the Apache License 2.0 by Gradle, Inc. Its SHA-256 is `b3a875ddc1f044746e1b1a55f645584505f4a10438c1afea9f15e92a7c42ec13`. [Source](https://github.com/gradle/gradle/tree/v9.3.1), [license](https://github.com/gradle/gradle/blob/v9.3.1/LICENSE).

The Android SDK, Android emulator, system images, Java and Android/Compose libraries are separately installed tooling. They are not redistributed in the plugin. Their licenses remain their respective owners' licenses.

The upstream [Build iOS Apps plugin](https://github.com/openai/plugins/tree/main/plugins/build-ios-apps) informed the capability mapping. This is an independent Android implementation; it is not an OpenAI product or an official Android plugin.
