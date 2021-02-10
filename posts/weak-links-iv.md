# Weak Links IV

On the recurring theme of tweaking the website, the index page is now generated from Markdown too. This was mainly done for consistency with the posts and the fact that it's a lot nicer to write in Markdown than it is in HTML.

I finished writing a [short tutorial](https://github.com/bentrevett/a-tour-of-pytorch-optimizers) on how different gradient descent optimizers work, with a focus on ones used in PyTorch. There has been a significant amount of new optimizers proposed since [Adam](https://arxiv.org/abs/1412.6980) in 2014, but none have caught on. Most people seem to be fiddling around with learning rate schedulers, such as cosine annealing or using a warm-up then cool-down schedule when fine-tuning a pre-trained model.

## Links

### https://monetize.substack.com/p/open-source-eras

Open source software has taken over the world. This is a good thing. However, open source software is maintained by few people, all of whom receive little funding whilst their software is used by multi-billion dollar companies. This is not a good thing. I don't think the GitHub Sponsors/Patreon payment model will work for anyone except a few whales. Most open source software now is created with the aims of using it as a marketing tool in order to sell business/enterprise support. Are people mainly doing this as a way to support their open source software? Or did they do all of this just to make money? To the independent software developer it doesn't matter at all. They get access to high quality open source software without paying a penny, see: [transformers](https://github.com/huggingface/transformers), [wandb](https://github.com/wandb/client), etc.

### https://matklad.github.io//2021/02/06/ARCHITECTURE.md.html

More documentation is always good. Reading code is hard. Trying to read a monolithic code base in order to find something is extremely hard, especially because GitHub search is so awful. Always use [grep.app](https://grep.app/) instead of GitHub search.

### https://brandur.org/fragments/graceful-degradation-time

You should write your website in Markdown and use Git for version control, because these things will last a long time. Hey, look, that's exactly what I'm doing on my website!

### https://meltingasphalt.com/interactive/going-critical/

Fun visualizations showing how complex systems can be created by constantly adding simple rules. Especially interesting is the fact they used it to model the spread of diseases back in 2019.

### https://github.com/PyTorchLightning/pytorch-lightning

The lead of pytorch-lightning got into trouble recently because his new library, [lightning-flash](https://github.com/PyTorchLightning/lightning-flash), was apparently a little too similar to the [fastai](https://github.com/fastai/fastai) library. This caused some Twitter drama, which nobody enjoys, but at least it caused me to finally check out pytorch-lightning.

My verdict? I'm split. The main two classes are the `LightningModule` and the `Trainer`. The `LightningModule` is a wrapper around PyTorch modules and the `Trainer` performs the train-val-test loop. It is definitely a good thing that there exists well tested code for the train-val-test loop. It saves other developers having to write potentially buggy implementations themselves. The downside is that because you need this structure in the train-val-test loop you need your PyTorch module wrapped up in a `LightningModule` which uses a weird mismatch of inheritance and callbacks, both of which are good things but really don't work well together here. Or maybe I'm just too used to plain PyTorch. Saying that, I do like the fact that it doesn't abstract code away but merely re-arranges it, and I do like some extra things included in the `Trainer`, like being able to run two validation batches at the beginning of training just to check for bugs. I only train models on a single GPU, so I can't speak for how well it generalizes code to multi-GPU, but I've heard good things.

Speaking of ML/DL libraries, [HuggingFace datasets](https://github.com/huggingface/datasets) is great.

### https://www.thisworddoesnotexist.com/

Probably the best use of NLP ever.
