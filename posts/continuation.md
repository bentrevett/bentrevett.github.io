# Continuation

Well, I did it. I managed to write two posts within one month, a new record. I also finally got around to installing `pandoc` and am now using that to generate the HTML for these posts. A while ago I used a static site generator, but I always felt like they took too much messing about with to configure anything. I never wanted my website to be anything more than very basic HTML anyway, so I wrote everything myself. The issue was a lot of copy and pasting whenever I wanted to add a new page. Now I can just write everything up in markdown and have `pandoc` generate the HTML which is then added to a HTML template. Now I only have to change a single template instead of multiple HTML files.

Here is some rambling on a few topics.

## Thoughts

### Substack vs Medium

Why has Substack beaten Medium? I don't understand how Medium became absolute crap in the last few years. The same thing happened with Quora. Is growth a giant quality killer? Whenever I search for some sort of tutorial or guide on Google I will be flooded with Medium posts, the majority of which are absolute rubbish with incredibly high-level hand-wavy explanations and usually plaigarised. Substack is mainly going after the newsletter crowd, rather than the crappy tutorial crowd, so maybe that's why. Did Medium purposefully go after the tutorial writers? Or did it end up this way by chance? Are all the tutorial writing people now going to stick to Medium? Or are they going to migrate to Substack and ruin that too? 

## Links

### <https://openai.com/blog/dall-e/> and <https://openai.com/blog/clip/>

More work by OpenAI. DALL-E generates impressive images from text but the code is behind closed doors, the examples are cherry picked, and there's no paper available. More interesting is CLIP, a joint image-text encoder which has impressive one-shot classification results and the model weights are [open source](https://github.com/openai/CLIP). Ideally, the whole thing should be open source so people can replicate the model from scratch, but considering the scale it was trained at I understand that (a) their large scale architecture is closed source, and (b) it's a lot of effort to write some open source code for large scale training that would work for everyone.

### <https://marksaroufim.medium.com/machine-learning-the-great-stagnation-3a0f044e17e0>

I agree with everything in this post. Machine learning research is now boring, it's all just applying Transformer models to everything. This might just be a phase, there have been phases where GANs were applied to everything, but it feels like the whole field is really running out of steam and the only way to keep up is by spending a ridiculous amount of money on compute. Yes, there is work on low compute out there, but what about medium compute? What about research I can do with a single GPU at home?

### <https://www.mihaileric.com/posts/we-need-data-engineers-not-data-scientists/>

There are only four types of data jobs: data scientist, data engineer, ml scientist and ml engineer. We need more engineers, not scientists because [the bitter lesson](http://www.incompleteideas.net/IncIdeas/BitterLesson.html) is that the neural network architectures we have might be good enough, and the best way to get improved performance is just to scale everything up. However, we won't get data engineers because data science is still such a hot topic and very easy to pick up due to the availability of high quality open-source libraries, like Tensorflow and Scikit learn. Data engineering is difficult and the problems are very specific, there isn't a Medium post that holds your hand as you call `model.fit` on the Iris dataset. We all know difficult things aren't sexy. It's not cool to put effort into something. It's not cool to say you're trying really hard. The exception to this is the start-up scene where "hustle culture" is seen as something to obtain, but that's trying really hard to earn lots of money. Where are the people trying really hard on something because they can? Is it just not worth the time and effort?

### <https://malco.io/2021/01/04/data-science-as-an-atomic-habit/>

I still I think every single these "self-help" style posts are a load of waffle, but I find comfort in reading them (it's most probably just a form of procrastination). I also wonder why people take advice from these self-help gurus. Their only skill is in providing self-help, usually some very surface level advice with vague and generic tips. If I wanted to learn how to be a better data scientist then I should take advice from an efficient and productive data scientist, not someone who writes about developing habits. Sure, if I learned how to develop habits and my habit was "to become a better data scientist" then yes, I would become a better data scientist. But isn't that obvious? Why do I need to buy a book to tell me that? The book I want to buy should tell me about data science, not habits.

### <https://dafoster.net/articles/2021/01/20/i-no-longer-trust-the-great-suspender/>

The Great Suspender, a browser extension which "suspends" unused tabs to reduce CPU usage, is now officially malware. Turns out that Chrome has had a similar built-in feature for years though, though confusingly they call it "discarding" instead of "suspending". Discarding sounds like it throws the tab away by deleting it. Turns out it just suspends it in a similar way to the way The Great Suspender did. Technically, suspending is not the same as discarding, but having a quick look online I can't seem to find the actual differences between the two which mean they can't be that important. I'm now using [Auto Tab Discard](https://github.com/rNeomy/auto-tab-discard) which uses Chrome's built-in discard feature. The solution to this would have been for enough people to pay the original maintainer of The Great Suspender so that he didn't have to transfer ownership to a dodgy company that harvests my data and sells it, but we're all used to getting everything for free so that was never going to happen.
