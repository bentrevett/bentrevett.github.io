import subprocess

html_template = """<!DOCTYPE html>
<html>
    <head>
        <link rel="stylesheet" type="text/css" href="styles.css">
        <link rel="stylesheet" type="text/css" href="/lib/font-awesome.min.css">
        <link rel="shortcut icon" type="image/x-icon" href="favicon.ico">
        <title>Ben Trevett</title>
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
                <a href="index.html">Home</a> | <a href="https://www.github.com/bentrevett/">GitHub</a> | <a href="https://www.twitter.com/ben_trevett/">Twitter</a>
            </td>
        </table>
        <hr>
        <!-- end header -->

{}
        <!-- begin footer -->
        <hr>
        <table>
            <td style="text-align:left">
                <a href="#">Home</a>
            </td>
            <td style="text-align:right">
                <a href="#">Top</a>
            </td>
        </table>
        <!-- end footer -->
    </body>
</html>"""

def get_html_from_md(md_path):

    html_content = subprocess.run(['pandoc', '--wrap=none', '-f', 'markdown', '-t', 'html', md_path],
                                  capture_output=True,
                                  check=True,
                                  text=True).stdout

    html = html_template.format(html_content)

    return html

md_path = 'index.md'
print(f'formatting index.md')
html = get_html_from_md(md_path)
html_path = md_path.replace('.md', '.html')
with open(html_path, 'w') as f:
    f.write(html)