---
layout: post
title: Hello World!
categories: misc
author:
- Ben Trevett
---

Every blog needs a 'Hello World' post upon creation. That is the law.

$$
a = b^2 + c^2
$$

```python
def cross_entropy(p, q, eps = 1e-10):
    """
    p is the true distribution, q is the estimated distribution
    """
    return - np.sum([pi * np.log2(qi+eps) for (pi, qi) in zip(p, q)])
```
