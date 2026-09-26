using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Diagnostics;
using System.Windows.Forms;

public sealed class MungPet : Form {
  readonly Bitmap[,] poses = new Bitmap[7,4];
  readonly Timer clock = new Timer();
  readonly Random rng = new Random();
  readonly ContextMenuStrip menu = new ContextMenuStrip();
  readonly ToolStripMenuItem pause = new ToolStripMenuItem("움직임 멈추기");
  readonly PetChat chat;
  int state=2, frame=0, step=0, idleTicks=0, specialTicks=0;
  bool stopped, dragging;
  Point origin;
  const int SizePx=96, DrawPx=90;
  public MungPet(string root){
    string[] names={"01_idle_front_4poses.png","02_walk_right_4poses.png","03_walk_left_4poses.png","04_walk_front_4poses.png","05_walk_back_4poses.png","06_sit_sleep_4poses.png","07_wave_4poses.png"};
    for(int i=0;i<7;i++)LoadSheet(Path.Combine(root,"assets",names[i]),i);
    chat=new PetChat(root);
    FormBorderStyle=FormBorderStyle.None;BackColor=Color.Magenta;TransparencyKey=Color.Magenta;
    ShowInTaskbar=false;TopMost=true;StartPosition=FormStartPosition.Manual;Size=new Size(SizePx,SizePx);
    Rectangle area=Screen.PrimaryScreen.WorkingArea;
    Location=new Point(area.Right-SizePx-48,area.Bottom-SizePx-12);
    var openChat=new ToolStripMenuItem("멍사자·친구 채팅");openChat.Click+=(s,e)=>chat.ShowChat();
    var cafe=new ToolStripMenuItem("주카페 열기");cafe.Click+=(s,e)=>chat.OpenCafe();
    pause.Click+=(s,e)=>{stopped=!stopped;pause.Text=stopped?"다시 움직이기":"움직임 멈추기";Invalidate();};
    var exit=new ToolStripMenuItem("종료");exit.Click+=(s,e)=>Close();
    menu.Items.Add(openChat);menu.Items.Add(cafe);menu.Items.Add(pause);menu.Items.Add(exit);
    MouseDown+=(s,e)=>{if(e.Button==MouseButtons.Right)menu.Show(this,e.Location);if(e.Button==MouseButtons.Left){dragging=true;origin=e.Location;Capture=true;}};
    MouseMove+=(s,e)=>{if(dragging)Location=new Point(Left+e.X-origin.X,Top+e.Y-origin.Y);};
    MouseUp+=(s,e)=>{dragging=false;Capture=false;};
    DoubleClick+=(s,e)=>chat.ShowChat();
    clock.Interval=120;clock.Tick+=(s,e)=>TickPet();clock.Start();
    Shown+=(s,e)=>chat.Startup();
  }
  void LoadSheet(string path,int index){
    using(Bitmap sheet=new Bitmap(path)){
      int w=sheet.Width/2,h=sheet.Height/2;
      for(int f=0;f<4;f++){
        Rectangle cell=new Rectangle((f%2)*w,(f/2)*h,w,h);
        // Keep each drawn pose centered and its feet on the same baseline.
        int minX=w,minY=h,maxX=-1,maxY=-1;
        for(int y=0;y<h;y+=2)for(int x=0;x<w;x+=2)
          if(sheet.GetPixel(cell.X+x,cell.Y+y).A>=128){minX=Math.Min(minX,x);minY=Math.Min(minY,y);maxX=Math.Max(maxX,x);maxY=Math.Max(maxY,y);}
        Bitmap result=new Bitmap(SizePx,SizePx,PixelFormat.Format32bppArgb);
        if(maxX>=minX){
          int bw=maxX-minX+3,bh=maxY-minY+3;
          float scale=Math.Min(84f/bw,84f/bh);
          int dw=Math.Max(1,(int)(bw*scale)),dh=Math.Max(1,(int)(bh*scale));
          using(Graphics g=Graphics.FromImage(result)){
            g.InterpolationMode=System.Drawing.Drawing2D.InterpolationMode.NearestNeighbor;
            g.PixelOffsetMode=System.Drawing.Drawing2D.PixelOffsetMode.Half;
            g.DrawImage(sheet,new Rectangle((SizePx-dw)/2,SizePx-dh-5,dw,dh),new Rectangle(cell.X+minX,cell.Y+minY,bw,bh),GraphicsUnit.Pixel);
          }
          // Binary alpha prevents purple fringing from a WinForms transparency key.
          for(int y=0;y<SizePx;y++)for(int x=0;x<SizePx;x++){
            Color c=result.GetPixel(x,y);
            result.SetPixel(x,y,c.A>=128?Color.FromArgb(255,c.R,c.G,c.B):Color.Transparent);
          }
        }
        poses[index,f]=result;
      }
    }
  }
  void TickPet(){
    if(stopped||dragging)return;
    step++;if(step%2!=0)return;
    frame=(frame+1)%4;
    if(specialTicks>0){specialTicks--;Invalidate();return;}
    if(idleTicks>0){idleTicks--;Invalidate();return;}
    if(step%48==0){
      int choice=rng.Next(7);
      if(choice==0){state=5;specialTicks=18;Invalidate();return;}
      if(choice==1){state=6;specialTicks=8;Invalidate();return;}
      state=rng.Next(1,5);idleTicks=rng.Next(6,16);
    }
    Rectangle bounds=Screen.FromPoint(new Point(Left+SizePx/2,Top+SizePx/2)).WorkingArea;
    int x=Left+(state==2?2:state==1?-2:0);
    int y=Top+(state==3?2:state==4?-2:0);
    if(x<bounds.Left){x=bounds.Left;state=2;}
    if(x+SizePx>bounds.Right){x=bounds.Right-SizePx;state=1;}
    if(y<bounds.Top){y=bounds.Top;state=3;}
    if(y+SizePx>bounds.Bottom){y=bounds.Bottom-SizePx;state=4;}
    Location=new Point(x,y);Invalidate();
  }
  protected override void OnPaint(PaintEventArgs e){base.OnPaint(e);int pose=specialTicks>0?state:idleTicks>0?0:state; e.Graphics.DrawImageUnscaled(poses[pose,frame],0,0);}
  protected override void WndProc(ref Message m){
    int pose=specialTicks>0?state:idleTicks>0?0:state;
    if(m.Msg==0x84&&!dragging&&poses[pose,frame]!=null){
      long pos=m.LParam.ToInt64();Point pt=PointToClient(new Point((short)(pos&65535),(short)((pos>>16)&65535)));
      if(pt.X<0||pt.Y<0||pt.X>=SizePx||pt.Y>=SizePx||poses[pose,frame].GetPixel(pt.X,pt.Y).A==0){m.Result=new IntPtr(-1);return;}
    }
    base.WndProc(ref m);
  }
  protected override void OnFormClosed(FormClosedEventArgs e){clock.Stop();clock.Dispose();menu.Dispose();chat.Close();foreach(Bitmap b in poses)b.Dispose();base.OnFormClosed(e);}
}
