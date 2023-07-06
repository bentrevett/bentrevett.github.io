import os
import re
import datetime

rss_template = """<rss xmlns:atom="http://www.w3.org/2005/Atom" version="2.0">
<channel>
<title>Ben Trevett blog</title>
<description>Posts by Ben Trevett</description>
<link>http://www.bentrevett.com/</link>
<atom:link href="http://www.bentrevett.com/feed.xml" rel="self" type="application/rss+xml"/>
<pubDate>{}</pubDate>
<lastBuildDate>{}</lastBuildDate>
{}
</channel>
</rss>"""

# for post in posts
# get title
# get "description" (content of posts)
# get link
# get date

posts = [post for post in os.listdir("source")]

items = []

for post in posts:
    with open(os.path.join("source", post), "r") as f:
        content = f.read()
    title = content.splitlines()[0].split("# ")[-1]
    iso_date = re.search('(?<=<span class="date">)(.*?)(?=</span>)', content).group(0)
    formatted_date = datetime.datetime.strptime(iso_date, "%Y-%m-%d").strftime(
        "%a, %d %b %Y %H:%M:%S"
    )
    description = content.split("\n")[4]
    item = {
        "title": title,
        "description": description,
        "link": f"https://www.bentrevett.com/posts/{post.split('.')[0]}.html",
        "date": formatted_date,
        "iso_date": iso_date,
    }
    items.append(item)

items = sorted(items, key=lambda x: x["iso_date"], reverse=True)

latest_date = items[0]["date"]

rss_items = ""

for item in items:
    rss_items += "<item>\n"
    rss_items += f"\t<title>{item['title']}</title>\n"
    rss_items += f"\t<description>{item['description']}</description>\n"
    rss_items += f"\t<link>{item['link']}</link>\n"
    rss_items += f"\t<guid>{item['link']}</guid>\n"
    rss_items += f"\t<pubDate>{item['date']}</pubDate>\n"
    rss_items += "</item>\n"

rss = rss_template.format(latest_date, latest_date, rss_items)

with open("feed.xml", "w") as f:
    f.write(rss)
