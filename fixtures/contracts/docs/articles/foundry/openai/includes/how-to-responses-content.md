---
ms.date: 08/18/2026
---

The Responses API creates, retrieves and deletes stateful responses.

Trimmed to the shape that matters for the fixture: a stub article whose real
content arrives through an include, so a regression to hashing the stub fails
a test rather than silently reporting "documentation unchanged" forever.

```json
{
  "model": "gpt-4o",
  "input": [{ "role": "user", "content": [{ "type": "input_text", "text": "hi" }] }]
}
```
