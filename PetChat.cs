using System;
using System.IO;
using System.Net;
using System.Text;
using System.Drawing;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Collections.Generic;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using System.Threading.Tasks;

public sealed class PetChat : Form {
  readonly string home;
  readonly TextBox url=new TextBox(),code=new TextBox(),text=new TextBox();
  readonly RichTextBox history=new RichTextBox();
  readonly ComboBox room=new ComboBox();
  readonly Label info=new Label();
  readonly Timer poll=new Timer();
  readonly JavaScriptSerializer json=new JavaScriptSerializer();
  string server="",token="";
  bool busy;
  public PetChat(string root){
    home=root;Text="멍사자 · 주카페 친구";Size=new Size(440,530);MinimumSize=new Size(360,440);
    StartPosition=FormStartPosition.CenterScreen;Font=new Font("Malgun Gothic",9);
    FormClosing+=(s,e)=>{if(e.CloseReason!=CloseReason.ApplicationExitCall){e.Cancel=true;Hide();}};
    var layout=new TableLayoutPanel {Dock=DockStyle.Fill,Padding=new Padding(10),ColumnCount=1,RowCount=8};
    layout.RowStyles.Add(new RowStyle(SizeType.Absolute,26));layout.RowStyles.Add(new RowStyle(SizeType.Absolute,33));
    layout.RowStyles.Add(new RowStyle(SizeType.Absolute,34));layout.RowStyles.Add(new RowStyle(SizeType.Absolute,33));
    layout.RowStyles.Add(new RowStyle(SizeType.Absolute,36));layout.RowStyles.Add(new RowStyle(SizeType.Percent,100));
    layout.RowStyles.Add(new RowStyle(SizeType.Absolute,36));layout.RowStyles.Add(new RowStyle(SizeType.Absolute,24));
    Controls.Add(layout);
    layout.Controls.Add(new Label {Text="같은 서버 주소를 입력하면 친구와 같은 방에 연결돼요",Dock=DockStyle.Fill},0,0);
    var row1=new TableLayoutPanel {Dock=DockStyle.Fill,ColumnCount=2};row1.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,75));row1.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,25));
    url.Dock=DockStyle.Fill;row1.Controls.Add(url,0,0);
    var save=new Button {Text="주소 연결",Dock=DockStyle.Fill};save.Click+=(s,e)=>ConnectAddress();row1.Controls.Add(save,1,0);layout.Controls.Add(row1,0,1);
    var row2=new TableLayoutPanel {Dock=DockStyle.Fill,ColumnCount=3};
    row2.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,50));row2.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,25));row2.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,25));
    code.Dock=DockStyle.Fill;code.MaxLength=12;row2.Controls.Add(code,0,0);
    var pair=new Button {Text="코드 연결",Dock=DockStyle.Fill};pair.Click+=(s,e)=>Pair();row2.Controls.Add(pair,1,0);
    var cafe=new Button {Text="카페 열기",Dock=DockStyle.Fill};cafe.Click+=(s,e)=>OpenCafe();row2.Controls.Add(cafe,2,0);layout.Controls.Add(row2,0,2);
    layout.Controls.Add(new Label {Text="카페 로그인 → 질문 퀘스트 → 연결 코드 받기 → 이 창에 코드 입력",Dock=DockStyle.Fill},0,3);
    room.Dock=DockStyle.Fill;room.DropDownStyle=ComboBoxStyle.DropDownList;
    room.Items.AddRange(new object[]{"멍사자 개인 대화","애니 이야기관","게임 길드","생활 정보관","공용 채팅"});room.SelectedIndex=0;
    room.SelectedIndexChanged+=(s,e)=>{history.Clear();RefreshMessages();};layout.Controls.Add(room,0,4);
    history.Dock=DockStyle.Fill;history.ReadOnly=true;history.BackColor=Color.FromArgb(255,249,238);layout.Controls.Add(history,0,5);
    var row3=new TableLayoutPanel {Dock=DockStyle.Fill,ColumnCount=2};row3.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,78));row3.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,22));
    text.Dock=DockStyle.Fill;text.MaxLength=300;row3.Controls.Add(text,0,0);
    var send=new Button {Text="보내기",Dock=DockStyle.Fill};send.Click+=(s,e)=>Send();row3.Controls.Add(send,1,0);
    text.KeyDown+=(s,e)=>{if(e.KeyCode==Keys.Enter){e.SuppressKeyPress=true;Send();}};layout.Controls.Add(row3,0,6);
    info.Dock=DockStyle.Fill;info.ForeColor=Color.SaddleBrown;layout.Controls.Add(info,0,7);
    string saved=Path.Combine(home,"server-url.txt");if(File.Exists(saved))url.Text=File.ReadAllText(saved,Encoding.UTF8).Trim();
    if(!String.IsNullOrWhiteSpace(url.Text)){try{server=Normalize(url.Text);token=LoadToken();}catch(Exception ex){info.Text=ex.Message;}}
    poll.Interval=5500;poll.Tick+=(s,e)=>RefreshMessages();poll.Start();
  }
  public void Startup(){if(String.IsNullOrEmpty(server))ShowChat();else OpenCafe();if(!String.IsNullOrEmpty(token))RefreshMessages();}
  public void ShowChat(){Show();BringToFront();Activate();RefreshMessages();}
  public void OpenCafe(){
    if(String.IsNullOrEmpty(server)){ShowChat();info.Text="먼저 서버 주소를 입력해 줘.";return;}
    try{Process.Start(new ProcessStartInfo(server+"/"){UseShellExecute=true});}catch(Exception e){info.Text=e.Message;ShowChat();}
  }
  string Normalize(string raw){
    Uri u;if(!Uri.TryCreate(raw.Trim(),UriKind.Absolute,out u)||!String.IsNullOrEmpty(u.UserInfo)||u.AbsolutePath!="/"||!String.IsNullOrEmpty(u.Query)||!String.IsNullOrEmpty(u.Fragment))throw new Exception("서버 주소는 https://도메인 형식으로 입력해 줘.");
    if(u.Scheme!="https"&&!(u.Scheme=="http"&&u.IsLoopback))throw new Exception("친구와 연결할 때는 HTTPS 주소가 필요해.");
    return u.GetLeftPart(UriPartial.Authority).TrimEnd('/');
  }
  string TokenFile {get{return Path.Combine(home,"pet-session.dat");}}
  string LoadToken(){try{byte[] data=File.ReadAllBytes(TokenFile);string value=Encoding.UTF8.GetString(ProtectedData.Unprotect(data,null,DataProtectionScope.CurrentUser));return value.StartsWith(server+"\n")?value.Substring(server.Length+1):"";}catch{return "";}}
  void SaveToken(string value){byte[] data=ProtectedData.Protect(Encoding.UTF8.GetBytes(server+"\n"+value),null,DataProtectionScope.CurrentUser);File.WriteAllBytes(TokenFile,data);}
  Dictionary<string,object> Request(string path,object body=null,bool auth=false){return RequestAt(server,path,body,auth);}
  Dictionary<string,object> RequestAt(string address,string path,object body=null,bool auth=false){
    var request=(HttpWebRequest)WebRequest.Create(address+path);request.Method=body==null?"GET":"POST";request.Timeout=12000;request.ReadWriteTimeout=12000;request.AllowAutoRedirect=false;
    request.Accept="application/json";
    if(auth)request.Headers[HttpRequestHeader.Authorization]="Bearer "+token;
    if(body!=null){byte[] bytes=Encoding.UTF8.GetBytes(json.Serialize(body));request.ContentType="application/json; charset=utf-8";request.ContentLength=bytes.Length;using(var stream=request.GetRequestStream())stream.Write(bytes,0,bytes.Length);}
    try{using(var resp=(HttpWebResponse)request.GetResponse())using(var stream=resp.GetResponseStream())using(var rd=new StreamReader(stream,Encoding.UTF8))return json.Deserialize<Dictionary<string,object>>(rd.ReadToEnd());}
    catch(WebException ex){
      var response=ex.Response as HttpWebResponse;
      if(response!=null){using(var rd=new StreamReader(response.GetResponseStream(),Encoding.UTF8)){string details=rd.ReadToEnd();try{var d=json.Deserialize<Dictionary<string,object>>(details);throw new Exception(Value(d,"error"));}catch(ArgumentException){throw new Exception("서버 오류 "+(int)response.StatusCode);}}}
      throw new Exception("서버에 연결할 수 없어. 주소와 터널 상태를 확인해 줘.");
    }
  }
  static string Value(Dictionary<string,object> d,string k){return d!=null&&d.ContainsKey(k)&&d[k]!=null?Convert.ToString(d[k]):"";}
  void Run(Func<Dictionary<string,object>> work,Action<Dictionary<string,object>> done){
    if(busy)return;busy=true;info.Text="연결 중…";
    Task.Run(()=>{try{var result=work();if(!IsDisposed)BeginInvoke(new Action(()=>{busy=false;info.Text="연결됨";done(result);}));}catch(Exception ex){if(!IsDisposed)BeginInvoke(new Action(()=>{busy=false;info.Text=ex.Message;}));}});
  }
  void ConnectAddress(){
    string next;try{next=Normalize(url.Text);}catch(Exception ex){info.Text=ex.Message;return;}
    string old=server;
    Run(()=>{var h=RequestAt(next,"/api/health");if(Value(h,"service")!="zoocafe-online")throw new Exception("주카페 서버 주소인지 확인해 줘.");return h;},d=>{
      server=next;
      if(old!=server){token="";if(File.Exists(TokenFile))File.Delete(TokenFile);}
      File.WriteAllText(Path.Combine(home,"server-url.txt"),server,Encoding.UTF8);
      info.Text="서버 연결됨 · 카페에서 연결 코드를 받아 줘.";
      OpenCafe();
    });
  }
  void Pair(){
    string entered=code.Text.Trim();if(entered.Length!=12||String.IsNullOrEmpty(server)){info.Text="서버 주소와 12자리 연결 코드를 확인해 줘.";return;}
    Run(()=>Request("/api/extension/pair",new {code=entered}),d=>{token=Value(d,"token");SaveToken(token);info.Text="멍사자와 연결됐어!";code.Clear();RefreshMessages();});
  }
  string RoomId {get{switch(room.SelectedIndex){case 1:return "bookshop";case 2:return "workshop";case 3:return "lodge";default:return "public";}}}
  void RefreshMessages(){
    if(busy||String.IsNullOrEmpty(token)||!Visible)return;
    bool personal=room.SelectedIndex==0;int selection=room.SelectedIndex;
    Run(()=>Request(personal?"/api/extension/personal-chat":"/api/extension/chat?room="+RoomId,null,true),d=>{
      if(room.SelectedIndex!=selection)return;
      object raw;d.TryGetValue("messages",out raw);
      var items=raw as object[];var sb=new StringBuilder();
      if(items!=null)foreach(object item in items){var m=item as Dictionary<string,object>;if(m==null)continue;string name=personal?(Value(m,"role")=="user"?"나":"멍사자"):Value(m,"nickname");sb.AppendLine(name+"  "+Value(m,"text"));sb.AppendLine();}
      string rendered=sb.ToString();if(history.Text!=rendered){history.Text=rendered;history.SelectionStart=history.TextLength;history.ScrollToCaret();}
      info.Text=personal?"멍사자와 개인 대화":("같은 건물 접속 "+Value(d,"online")+"명");
    });
  }
  void Send(){
    string message=text.Text.Trim();if(String.IsNullOrEmpty(token)){info.Text="먼저 연결 코드를 입력해 줘.";return;}
    if(message.Length==0||busy)return;
    bool personal=room.SelectedIndex==0;string roomId=RoomId;
    Run(()=>Request(personal?"/api/extension/personal-chat":"/api/extension/chat",personal?(object)new {text=message}:new {text=message,room=roomId},true),d=>{
      text.Clear();if(personal){history.AppendText("나  "+message+"\n\n멍사자  "+Value(d,"reply")+"\n\n");history.SelectionStart=history.TextLength;history.ScrollToCaret();}else RefreshMessages();
    });
  }
}
