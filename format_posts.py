import argparse
import language_tool_python
import os
import proselint
import subprocess

tool = language_tool_python.LanguageTool('en-US')

html_template = """<!DOCTYPE html>
<html>
    <head>
        <link rel="stylesheet" type="text/css" href="../styles.css">
        <link rel="shortcut icon" type="image/x-icon" href="../favicon.ico">
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

def check_grammar(md_path):

    with open(md_path, 'r') as f:
        content = f.read()
    suggestions = tool.check(content)

    for suggestion in suggestions:
        if suggestion.ruleId == 'EN_QUOTES':
            pass
        else:
            suggestion = str(suggestion)
            suggestion = suggestion.replace('\n', '\n\t')
            print(f'\t{suggestion}')

    return suggestions

def check_prose(md_path):

    with open(md_path, 'r') as f:
        content = f.read()
    suggestions = proselint.tools.lint(content)

    for suggestion in suggestions:
        check, message, line, column, *_ = suggestion
        print(f'\t{md_path}:{line}:{column}: {check} {message}')

    return suggestions

def get_html_from_md(md_path):

    html_content = subprocess.run(['pandoc', '--wrap=none', '-f', 'markdown', '-t', 'html', md_path],
                                  capture_output=True,
                                  check=True,
                                  text=True).stdout

    with open(md_path, 'r') as f:
        content = f.read()
    header = content.split('\n')[0]
    assert header.startswith('# '), f'{md_path} is missing a header!'
    title = header.split('# ')[-1]

    html = html_template.format(title, html_content)

    return html

parser = argparse.ArgumentParser()
parser.add_argument('file_name', type=str, nargs='?', default=None)
args = parser.parse_args()

if args.file_name is None:
    md_paths = [path for path in os.listdir('source') if path.endswith('.md')]
else:
    md_paths = [path for path in os.listdir('source') if (args.file_name in path and path.endswith('.md'))]

for md_path in md_paths:
    md_path = os.path.join('source', md_path)
    print(f'generating html from {md_path}')
    grammar_suggestions = check_grammar(md_path)
    prose_suggestions = check_prose(md_path)
    html = get_html_from_md(md_path)
    html_path = md_path.replace('source', 'posts')
    html_path = html_path.replace('.md', '.html')
    with open(html_path, 'w') as f:
        f.write(html)
