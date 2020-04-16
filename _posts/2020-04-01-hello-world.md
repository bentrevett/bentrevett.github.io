---
layout: post
title: Hello World!
categories: misc
use_math: true
author:
- Ben Trevett
---

Every blog needs a 'Hello World' post upon creation. That is the law.

Equations inline: $$a + b = c$$.

Display equation:

$$a + b = c$$

```python
def cross_entropy(p, q, eps = 1e-10):
    """
    p is the true distribution, q is the estimated distribution
    """
    return - np.sum([pi * np.log2(qi+eps) for (pi, qi) in zip(p, q)])
```
