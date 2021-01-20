import os
import subprocess

html_template = """<!DOCTYPE html>
<html>
    <head>
        <link rel="stylesheet" type="text/css" href="../styles.css">
        <title>Ben Trevett - {}</title>
        <!-- Global site tag (gtag.js) - Google Analytics -->
        <script async src="https://www.googletagmanager.com/gtag/js?id=UA-124821553-1"></script>
        <script>
        window.dataLayer = window.dataLayer || [];
        function gtag(){{dataLayer.push(arguments);}}
        gtag('js', new Date());
        gtag('config', 'UA-124821553-1');
        </script>
    </head>
    <body>
        <!-- begin header -->
        <table>
            <td style="text-align:left">
                <b>Ben Trevett</b>
            </td>
            <td style="text-align:right">
                <a href="https://bentrevett.com">Home</a> | <a href="https://www.github.com/bentrevett/">GitHub</a> | <a href="https://www.twitter.com/ben_trevett/">Twitter</a>
            </td>
        </table>
        <hr>
        <!-- end header -->

{}
        <!-- begin footer -->
        <hr>
        <table>
            <td style="text-align:right">
                <a href="#">Top</a>
            </td>
        </table>
        <!-- end footer -->
    </body>
</html>"""

def get_html_from_md(title, md_path):

    html_content = subprocess.run(['pandoc', '-f', 'markdown', '-t', 'html', md_path],
                                  capture_output=True,
                                  check=True,
                                  text=True).stdout

    html = html_template.format(title, html_content)

    return html

md_paths = [path for path in os.listdir('posts') if path.endswith('.md')]

for md_path in md_paths:
    title = md_path.split('.md')[0]
    md_path = os.path.join('posts', md_path)
    print(f'generating html from {md_path}')
    html = get_html_from_md(title, md_path)
    html_path = md_path.replace('.md', '.html')
    with open(html_path, 'w') as f:
        f.write(html)
