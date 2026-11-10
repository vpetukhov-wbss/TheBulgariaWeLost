---
paths:
  - "**/*store*.ts"
  - "**/*state*.ts"
  - "**/*facade*.ts"
---
# State decisions
- Classify state as ephemeral UI, URL/router, feature async cache, or server-owned; choose the owner first.
- Local signals + computed by default for simple synchronous state; RxJS for streams, cancellation and complex asynchronous flows.
- Do not mirror server state indefinitely or duplicate it across component/service/store; define invalidation and refresh semantics.
- Introduce NgRx or an equivalent library only when demonstrable complexity warrants it; document why.
