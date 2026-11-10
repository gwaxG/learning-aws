import re,glob,os,html
here=os.path.dirname(os.path.abspath(__file__))
parts=sorted(glob.glob(os.path.join(here,'src','*.html')))
body='\n'.join(open(p,encoding='utf-8').read() for p in parts)
toc=[]
for m in re.finditer(r'<section class="ch"([^>]*)id="([^"]+)"([^>]*)>\s*<h2>(.*?)</h2>',body,re.S):
    attrs=m.group(1)+m.group(3); w=re.search(r'data-weak="(\d)"',attrs)
    t=re.sub(r'<span class="b.*?</span>','',m.group(4)); n=re.match(r'\s*(\d+)\.\s*',t)
    num=n.group(1) if n else ''; t=re.sub(r'^\s*\d+\.\s*','',t)
    dot=f'<i class="dot d{w.group(1)}"></i>' if w else ''
    toc.append(f'<a href="#{m.group(2)}"><span class="n">{num}</span>{t}{dot}</a>')
tpl=open(os.path.join(here,'template.html'),encoding='utf-8').read()
out=tpl.replace('<!--TOC-->','\n'.join(toc)).replace('<!--BODY-->',body)
open(os.path.join(here,'saa-c03-book.html'),'w',encoding='utf-8').write(out)
print(len(parts),'parts,',len(toc),'chapters,',len(re.sub(r'<[^>]+>',' ',body).split()),'words')
