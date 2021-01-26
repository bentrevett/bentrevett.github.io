# Weak Links II

I've decided to keep up with constantly posting interesting links along with my comments and adjacent thoughts on them. It actually helps me write down a lot of things that I'm subconsciously thinking and haven't ever put down on paper or expressed to anyone else, which is good.

The names of these posts has changed to *weak links*, because weak sounds like week, and I'd like to post these weekly but not actually commit to posting weekly, hence the pun. The name changed has also helped because I don't know how much longer I could've kept thinking of decent post titles.

I also added [`proselint`](https://github.com/amperser/proselint) and [`language_tool_python`](https://github.com/languagetool-org/languagetool) to my Markdown to HTML generator because I make too many writing mistakes and wanted an easier way to find my mistakes than copy and pasting everything into the Grammarly website.

## Links

### <https://blog.evjang.com/2021/01/understanding-ml.html>

Most papers are not worth reading, and the ones that you do read should only be skimmed to get the key novel idea and findings.

I've found that the best way to read (recent machine learning) research papers is by not actually reading the entire paper. The results section, especially, is a waste of time. I usually read the abstract (for the overview of the entire paper) then look at all the figures, then introduction (to give more background context), the conclusion (for a brief overview of the findings) and then the methodology (for more details on what they're actually doing). I'll finish off by reading the discussion section (to see if there are any interesting findings). The results section is only worth looking at if you're planning on replicating the paper, although it usually doesn't contain enough information to entirely replicate it. I'll check out the related work section if I want to follow-up by reading other related papers, though sometimes you need to read it understand the models the authors are comparing their paper to.

### <https://krokotsch.eu/autoencoders/2021/01/24/Autoencoder_Bake_Off.html>

This is how all machine learning tutorials should be written, not some Medium article that uses gigantic font and has nothing but surface level descriptions which are worse than the introductory paragraph of Wikipedia articles. There are actual introduction, methodology, results and discussion sections. Blog posts should be more like research papers, but not too much.

It also reminds me that I'd like to write some tutorials on implementing different auto-encoder architectures and this would be a good starting point.

### <https://krokotsch.eu/cleancode/2020/08/11/Unit-Tests-for-Deep-Learning.html>

By the same author as the auto-encoder article. I don't write enough tests for my deep learning code, and I definitely should write more. A lot of deep learning code simply isn't tested, which is ironic as researchers are publishing work that they are claiming is some scientific breakthrough, but their results could be due to a simple bug. This doesn't necessarily mean the researcher is bad, nobody can write code without bugs, but it means the methodology is flawed. Imagine having an AI lab spend thousands of dollars and use thousands of kilowatts of electricity and hundreds of hours of their time only to fail to replicate your work because it was silently broadcasting a tensor where it shouldn't have been.

### <https://togelius.blogspot.com/2021/01/copernican-revolutions-of-mind.html>

I don't agree with AGI alarmists. I don't think AGI is anywhere in the near future, perhaps not even the far future. GPT-3, the prime example for "the singularity is nigh!" people, is good at filling in blanks. It is not intelligent, it's just the case that filling in the blanks involves a lot of implicit knowledge behind the scenes that makes it seem like it has intelligence.

*"I took my `<MASK>` for a walk in the park, and he barked non-stop!"*

The most likely candidate for the masked token is "dog". Why? Because a dog is something you take for a walk in the park and barks. Do you have to be "intelligent" to figure this out, or do you just need to see a lot of examples?

### <https://colah.github.io/notes/taste/>

Research is similar to journalism in the fact that some authors get a "beat", a topic which they specialize in and rarely stray away from. These authors usually write the best papers in that field. Everyone should find a beat, but before you do that you should ideally play around in all the other topics first. Plus, a good way to get ideas for your field is to steal them from other fields.

### <https://julian.digital/>

I found this website through the author's [Proof of X](https://julian.digital/2020/08/06/proof-of-x/) post, which I enjoyed, but I mostly enjoy the website's simple and clean design. I've been collecting a few links on simple websites for the last few weeks:

* https://1mb.club/
* https://simplifier.neocities.org/
* https://neat.joeldare.com/
* https://100r.co/site/home.html
* https://marijnflorence.neocities.org/linkroll/
* https://webring.xxiivv.com/
* https://dreamwiki.sixey.es/welcome.dream/
* https://drewdevault.com/
* https://andybrewer.github.io/mvp/

Oh yeah, bring back [webrings](https://en.wikipedia.org/wiki/Webring).
