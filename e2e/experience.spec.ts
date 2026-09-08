import { createHmac } from "node:crypto";
import { expect, test, type BrowserContext } from "@playwright/test";

async function useExperienceSession(context: BrowserContext, id: string) {
  const payload=Buffer.from(JSON.stringify({id,session_version:1,exp:Date.now()+3600000})).toString("base64url");
  const signature=createHmac("sha256","experience-test-only-secret-with-32-characters").update(payload).digest("base64url");
  await context.addCookies([{name:"courtside_session",value:`${payload}.${signature}`,domain:"127.0.0.1",path:"/"}]);
}

test.beforeEach(async ({ context }) => {
  await useExperienceSession(context,"20000000-0000-4000-8000-000000000001");
});

test("super_adminの常設チャットで選択肢・追従・入力消去・会話保持",async({page},testInfo)=>{
  await page.route("**/api/chatbot/preview",async(route)=>{
    const body=route.request().postDataJSON();
    await route.fulfill({json:body.choiceId?{answer:"選択された回答です。"}:{answer:"どれについて知りたいですか？",source:"内部ファイル",choices:[
      {id:"10000000-0000-4000-8000-000000000001",label:"1",title:"非常に長い候補タイトルでも画面からはみ出さずに選択できることを確認する質問です"},
      {id:"10000000-0000-4000-8000-000000000002",label:"2",title:"参加条件について"},
      {id:"10000000-0000-4000-8000-000000000003",label:"3",title:"活動日について"},
    ]}});
  });
  await page.goto("/admin/faqs");
  await page.getByRole("button",{name:"チャットを開く"}).click();
  const dialog=page.getByRole("dialog");
  const input=dialog.getByRole("textbox",{name:"質問",exact:true});
  await input.fill("質問です"); await dialog.getByRole("button",{name:"送信",exact:true}).click();
  await expect(input).toHaveValue("");
  const choice=dialog.getByRole("button",{name:/非常に長い候補/});
  await expect(choice).toBeVisible();
  const other=dialog.getByRole("button",{name:/4.*その他/});
  await expect(other).toBeVisible();
  const box=await choice.boundingBox(), bounds=await dialog.boundingBox();
  expect(box!.x+box!.width).toBeLessThanOrEqual(bounds!.x+bounds!.width);
  const otherBox=await other.boundingBox();
  expect(otherBox!.x+otherBox!.width).toBeLessThanOrEqual(bounds!.x+bounds!.width);
  await choice.click();
  await expect(dialog.getByText("選択された回答です。")).toBeVisible();
  await expect.poll(()=>dialog.locator(".chatbot-messages").evaluate((e)=>e.scrollHeight-e.clientHeight-e.scrollTop)).toBeLessThan(3);
  await dialog.getByRole("button",{name:"チャットを閉じる"}).click();
  await page.getByRole("button",{name:"チャットを開く"}).click();
  await expect(dialog.getByText("選択された回答です。")).toBeVisible();
  await dialog.getByRole("button",{name:"管理者",exact:true}).click();
  await expect(dialog.getByText("選択された回答です。")).not.toBeVisible();
  await dialog.getByRole("button",{name:"一般ユーザー",exact:true}).click();
  await expect(dialog.getByText("選択された回答です。")).toBeVisible();
  await page.screenshot({path:testInfo.outputPath("chatbot.png")});
  await page.mouse.click(2,2); await expect(dialog).not.toBeVisible();
});

test("FAQの持ち手ドラッグ・横スワイプは削除や保存を即実行しない",async({page,context},testInfo)=>{
  await page.goto("/admin/faqs");
  const cards=page.locator(".faq-admin-card");
  const firstId=await cards.first().getAttribute("data-faq-id");
  let mutations=0; page.on("request",req=>{if(req.method()==="POST")mutations++;});
  await cards.first().scrollIntoViewIfNeeded();
  const from=await cards.first().locator(".faq-drag-handle").boundingBox();
  const to=await cards.nth(1).locator(".faq-row-tools").boundingBox();
  if(testInfo.project.name==="mobile"){
    const cdp=await context.newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:from!.x+16,y:from!.y+16}]});
    await page.waitForTimeout(400);
    await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:from!.x+16,y:to!.y+16}]});
    await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    const summary=cards.first().locator("summary"); await summary.scrollIntoViewIfNeeded(); const box=await summary.boundingBox();
    await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:box!.x+box!.width-25,y:box!.y+20}]});
    await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:box!.x+25,y:box!.y+20}]});
    await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    await expect(cards.first().getByRole("button",{name:"削除",exact:true})).toBeVisible();
  }else{
    await page.mouse.move(from!.x+16,from!.y+16); await page.mouse.down(); await page.mouse.move(from!.x+16,to!.y+16,{steps:8}); await page.mouse.up();
  }
  await expect(cards.first()).not.toHaveAttribute("data-faq-id",firstId!);
  expect(mutations).toBe(0);
});

test("一般利用画面は内部情報を隠し、一般回答は押下後のみ",async({page,context})=>{
  const payload=Buffer.from(JSON.stringify({id:"20000000-0000-4000-8000-000000000002",session_version:1,exp:Date.now()+3600000})).toString("base64url");
  const signature=createHmac("sha256","experience-test-only-secret-with-32-characters").update(payload).digest("base64url");
  await context.addCookies([{name:"courtside_session",value:`${payload}.${signature}`,domain:"127.0.0.1",path:"/"}]);
  let calls=0;
  await page.route("**/api/chatbot/preview",async(route)=>{calls++;await route.fulfill({json:calls===1?{answer:"資料には記載がありません。",source:"非表示の内部ファイル",generalTicket:"test-only-ticket"}:{answer:"Fortyloveの公式回答ではありません。一般的な参考情報です。"}});});
  await page.goto("/home"); await page.getByRole("button",{name:"チャットを開く"}).click();
  const dialog=page.getByRole("dialog");
  await dialog.getByRole("textbox",{name:"質問",exact:true}).fill("テニスのルール"); await dialog.getByRole("button",{name:"送信"}).click();
  const button=dialog.getByRole("button",{name:/一般的な回答を見る/}); await expect(button).toBeVisible();
  expect(calls).toBe(1); await expect(dialog.getByText("非表示の内部ファイル",{exact:false})).not.toBeVisible();
  await button.click(); await expect(dialog.getByText(/公式回答ではありません/)).toBeVisible(); expect(calls).toBe(2);
  await dialog.getByText("利用について",{exact:true}).click(); await expect(dialog.getByText(/外部AIサービスを利用する場合/)).toBeVisible();
});

test("画面遷移中は進行表示が出て完了後に消える",async({page})=>{
  await page.goto("/home");
  await page.route("**/faq?*",async(route)=>{await new Promise(resolve=>setTimeout(resolve,1200));await route.continue();});
  await page.getByRole("navigation",{name:"会員メニュー"}).getByRole("link",{name:"FAQ"}).click();
  await expect(page.locator(".navigation-progress, .page-loading").first()).toBeVisible();
  await expect(page.getByRole("heading",{name:"よくある質問"})).toBeVisible();
  await expect(page.locator(".navigation-progress")).toHaveCount(0);
});

test("FAQを折りたたみ、並び順は確定時だけ保存する",async({page},testInfo)=>{
  await page.goto("/admin/faqs");
  await expect(page.locator(".faq-admin-card textarea").first()).not.toBeVisible();
  let saves=0; page.on("request",(req)=>{if(req.method()==="POST"&&req.headers()["next-action"])saves++;});
  const firstQuestion=await page.locator(".faq-swipe-target").first().innerText();
  await page.getByRole("button",{name:`${firstQuestion}を下へ`,exact:true}).click();
  expect(saves).toBe(0);
  await page.getByRole("button",{name:"変更を確定",exact:true}).click();
  await expect(page.getByText("並び順を保存しました。")).toBeVisible();
  expect(saves).toBe(1);
  await page.locator(".faq-swipe-target").first().click();
  await expect(page.locator(".faq-admin-card textarea").first()).toBeVisible();
  await page.screenshot({path:testInfo.outputPath("faq.png"),fullPage:true});
});

test("取り込み前に1001件超過を表示し送信しない",async({page})=>{
  await page.goto("/admin/chatbot");
  const content=Array.from({length:1001},(_,i)=>`## 質問${i}\n回答です。`).join("\n");
  const input = page.locator('.import-drop input');
  await expect(input).toBeEnabled();
  await input.setInputFiles({name:"limit.md",mimeType:"text/markdown",buffer:Buffer.from(content)});
  await expect(page.getByText(/1000件の上限を超えています/)).toBeVisible();
  await expect(page.getByRole("button",{name:"アップロード・再試行"})).toBeDisabled();
});

test("受付停止は新規登録のみ・FAQを会員ナビから開ける",async({page},testInfo)=>{
  await page.goto("/register");
  await expect(page.getByRole("heading",{name:"今年度の新歓は終了しました！"})).toBeVisible();
  await expect(page.locator("#registration-form")).toHaveCount(0);
  await page.screenshot({path:testInfo.outputPath("registration-closed.png")});
  await page.goto("/home");
  await expect(page.getByRole("heading",{name:"次の参加予定"})).toBeVisible();
  await page.getByRole("navigation",{name:"会員メニュー"}).getByRole("link",{name:"FAQ"}).click();
  await expect(page.getByRole("heading",{name:"よくある質問"})).toBeVisible();
  const categoryBox=await page.locator(".faq-category").last().boundingBox();
  const questionBox=await page.locator(".faq-question-panel").boundingBox();
  expect(questionBox!.y).toBeGreaterThanOrEqual(categoryBox!.y+categoryBox!.height);
});

test("会員ホーム・イベントナビ・イベント詳細を表示できる",async({page},testInfo)=>{
  await page.goto("/home");
  await expect(page.getByRole("heading",{name:"次の参加予定"})).toBeVisible();
  await page.screenshot({path:testInfo.outputPath("member-home.png"),fullPage:true});
  await page.getByRole("navigation",{name:"会員メニュー"}).getByRole("link",{name:"イベント"}).click();
  await expect(page.getByRole("heading",{name:"イベント一覧"})).toBeVisible();
  await expect(page.locator(".event-gallery-card")).toHaveCount(3);
  await page.screenshot({path:testInfo.outputPath("events.png"),fullPage:true});
  await page.locator(".event-gallery-card").first().click();
  await expect(page.getByRole("dialog",{name:/初心者歓迎 テニス練習会/})).toBeVisible();
  await page.screenshot({path:testInfo.outputPath("event-detail.png"),fullPage:true});
});

test("プロフィールメニューはデスクトップの会員ナビと重ならない",async({page},testInfo)=>{
  test.skip(testInfo.project.name==="mobile","モバイルでは下部ナビを使用するため");
  await page.goto("/faq");
  await page.locator(".user-menu > summary").click();
  const menu=page.locator(".user-menu-panel");
  const tabs=page.locator(".member-tabs");
  await expect(menu).toBeVisible();
  const menuBox=await menu.boundingBox();
  const tabsBox=await tabs.boundingBox();
  expect(menuBox!.y).toBeGreaterThanOrEqual(tabsBox!.y+tabsBox!.height);
});

test("スマホのプロフィールメニューをプロフィールアイコンより前面に表示する",async({page},testInfo)=>{
  test.skip(testInfo.project.name!=="mobile","モバイル表示専用の確認");
  await useExperienceSession(page.context(),"20000000-0000-4000-8000-000000000002");
  await page.goto("/profile");
  await page.locator(".user-menu > summary").click();
  const menu=page.locator(".user-menu-panel");
  const logout=menu.getByRole("button",{name:"ログアウト"});
  await expect(logout).toBeVisible();
  await expect(logout).toContainText("ログアウト");
  const menuBox=await menu.boundingBox();
  const avatarBox=await page.locator(".profile-avatar").boundingBox();
  const overlap={
    left:Math.max(menuBox!.x,avatarBox!.x),right:Math.min(menuBox!.x+menuBox!.width,avatarBox!.x+avatarBox!.width),
    top:Math.max(menuBox!.y,avatarBox!.y),bottom:Math.min(menuBox!.y+menuBox!.height,avatarBox!.y+avatarBox!.height),
  };
  expect(overlap.right).toBeGreaterThan(overlap.left);
  expect(overlap.bottom).toBeGreaterThan(overlap.top);
  const menuIsOnTop=await page.evaluate(({x,y})=>Boolean(document.elementFromPoint(x,y)?.closest(".user-menu-panel")),{
    x:(overlap.left+overlap.right)/2,y:(overlap.top+overlap.bottom)/2,
  });
  expect(menuIsOnTop).toBe(true);
  await page.screenshot({path:testInfo.outputPath("mobile-user-menu.png")});
});

test("プロフィールの所属情報を中央揃えの段落で表示する",async({page,context})=>{
  await useExperienceSession(context,"20000000-0000-4000-8000-000000000002");
  await page.goto("/profile");
  const affiliation=page.locator(".profile-affiliation");
  await expect(affiliation.getByText("早稲田大学",{exact:true})).toBeVisible();
  await expect(affiliation.getByText("法学部",{exact:true})).toBeVisible();
  await expect(affiliation.locator("p")).toHaveCount(3);
  await expect(affiliation).toHaveCSS("text-align","center");
});

test("adminにはプロフィールを表示せず未入力memberはプロフィールを作成できる",async({page,context})=>{
  await page.goto("/admin");
  await expect(page.getByRole("link",{name:"プロフィール編集"})).toHaveCount(0);
  await page.goto("/profile");
  await expect(page).toHaveURL(/\/admin$/);

  await useExperienceSession(context,"20000000-0000-4000-8000-000000000003");
  await page.goto("/profile");
  await expect(page.getByText("プロフィールを作成しましょう")).toBeVisible();
  await expect(page.getByRole("button",{name:"プロフィールを作成"})).toBeVisible();
  await expect(page.locator('select[name="grade"]')).toHaveValue("");
});

test("super_adminは管理画面からイベント参加ページを開ける",async({page},testInfo)=>{
  await page.goto("/admin/participation");
  await expect(page.getByRole("heading",{name:"イベントに参加"})).toBeVisible();
  await expect(page.locator(".event-gallery-card")).toHaveCount(3);
  await page.locator(".event-gallery-card").first().click();
  await expect(page.getByRole("dialog",{name:/初心者歓迎 テニス練習会/})).toBeVisible();
  await page.screenshot({path:testInfo.outputPath("super-admin-participation.png"),fullPage:true});
});

test("スマホのイベント管理で日時入力が枠内に収まる",async({page},testInfo)=>{
  test.skip(testInfo.project.name!=="mobile","モバイル表示専用の確認");
  await page.goto("/admin/events");
  await page.locator(".create-panel > summary").click();
  for (const name of ["starts_at","ends_at"]) {
    const input=page.locator(`input[name="${name}"]`).first();
    const inputBox=await input.boundingBox();
    const labelBox=await input.locator("xpath=..").boundingBox();
    expect(inputBox!.x).toBeGreaterThanOrEqual(labelBox!.x-1);
    expect(inputBox!.x+inputBox!.width).toBeLessThanOrEqual(labelBox!.x+labelBox!.width+1);
  }

  const lastActions=page.locator(".admin-event-actions").last();
  await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
  const editBox=await lastActions.getByRole("button",{name:"編集"}).boundingBox();
  const deleteBox=await lastActions.getByRole("button",{name:"削除"}).boundingBox();
  const chatbotBox=await page.getByRole("button",{name:"チャットを開く"}).boundingBox();
  expect(Math.abs(editBox!.width-deleteBox!.width)).toBeLessThanOrEqual(1);
  const overlaps=!(deleteBox!.x+deleteBox!.width<=chatbotBox!.x||chatbotBox!.x+chatbotBox!.width<=deleteBox!.x||deleteBox!.y+deleteBox!.height<=chatbotBox!.y||chatbotBox!.y+chatbotBox!.height<=deleteBox!.y);
  expect(overlaps).toBe(false);
  await page.screenshot({path:testInfo.outputPath("mobile-admin-event-actions.png"),fullPage:true});
});
