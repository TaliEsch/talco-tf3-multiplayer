using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Threading;
using Microsoft.Win32;
using System.Windows.Markup;

[assembly: AssemblyTitle("TF3 Multiplayer Prototype Launcher")]
[assembly: AssemblyDescription("Simple host and join launcher for the TF3 Multiplayer Prototype")]
[assembly: AssemblyCompany("TF3 Multiplayer Prototype contributors")]
[assembly: AssemblyProduct("TF3 Multiplayer Prototype")]
[assembly: AssemblyCopyright("Copyright (c) 2026 TF3 Multiplayer Prototype contributors")]
[assembly: AssemblyVersion("0.6.25.0")]
[assembly: AssemblyFileVersion("0.6.25.0")]

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        Application app = new Application();
        app.ShutdownMode = ShutdownMode.OnMainWindowClose;
        app.Run(new MainWindow());
    }
}

internal sealed class MainWindow : Window
{
    private const string GameExe = @"E:\Steam\steamapps\common\Transport Fever 3\TransportFever3.exe";
    private const string StagingRoot = @"E:\Steam\userdata\109855567\3493540\local\staging_area";
    private const string StagedMod = @"E:\Steam\userdata\109855567\3493540\local\staging_area\tf3mp_status_1";
    private const int GamePort = 37333;
    private const int SavePort = 37334;
    private readonly string projectRoot;
    private readonly Brush pageBrush = new SolidColorBrush(Color.FromRgb(15, 20, 29));
    private readonly Brush cardBrush = new SolidColorBrush(Color.FromRgb(27, 35, 48));
    private readonly Brush mutedBrush = new SolidColorBrush(Color.FromRgb(160, 174, 193));
    private readonly Brush accentBrush = new SolidColorBrush(Color.FromRgb(75, 137, 255));
    private Grid page;
    private TextBox logBox;
    private TextBlock statusText;
    private Process helper;
    private Button batchConfirmButton;
    private Button batchStartButton;
    private Button phase2SetupButton;
    private Button phase2SetupConfirmButton;
    private Expander advancedDiagnostics;
    private bool batchControlsReady;
    private bool guidedBatchOwnsHelper;
    private bool phase2SetupConfirmed;
    private string pendingPhase2SetupHash;
    private int pendingPhase2OriginalCompany;
    private int pendingPhase2TargetCompany;
    private int pendingPhase2FundingAmount;
    private string secret;
    private string modHash;
    private string joiningSaveName;
    private bool busy;
    private readonly StringBuilder logHistory = new StringBuilder();
    private Action hostReady;
    private bool unauditedBuild;
    private string sessionFailure;

    internal MainWindow()
    {
        projectRoot = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
        Title = "TF3 Multiplayer";
        using (Stream iconStream = Assembly.GetExecutingAssembly().GetManifestResourceStream("TF3MP.LauncherIcon"))
        {
            if (iconStream != null) Icon = System.Windows.Media.Imaging.BitmapFrame.Create(iconStream, System.Windows.Media.Imaging.BitmapCreateOptions.None, System.Windows.Media.Imaging.BitmapCacheOption.OnLoad);
        }
        Width = 940; Height = 650; MinWidth = 820; MinHeight = 580;
        WindowStartupLocation = WindowStartupLocation.CenterScreen;
        Background = pageBrush; Foreground = Brushes.White;
        FontFamily = new FontFamily("Segoe UI");
        Resources.Add(typeof(Button), (Style)XamlReader.Parse(@"<Style xmlns='http://schemas.microsoft.com/winfx/2006/xaml/presentation' TargetType='Button'>
          <Setter Property='Cursor' Value='Hand'/><Setter Property='Foreground' Value='White'/>
          <Setter Property='Template'><Setter.Value><ControlTemplate TargetType='Button'>
            <Border x:Name='surface' xmlns:x='http://schemas.microsoft.com/winfx/2006/xaml' Background='{TemplateBinding Background}' BorderBrush='{TemplateBinding BorderBrush}' BorderThickness='{TemplateBinding BorderThickness}' CornerRadius='9' Padding='{TemplateBinding Padding}'>
              <ContentPresenter HorizontalAlignment='Center' VerticalAlignment='Center'/>
            </Border><ControlTemplate.Triggers>
              <Trigger Property='IsMouseOver' Value='True'><Setter TargetName='surface' Property='Opacity' Value='0.82'/></Trigger>
              <Trigger Property='IsEnabled' Value='False'><Setter TargetName='surface' Property='Opacity' Value='0.4'/></Trigger>
              <Trigger Property='IsKeyboardFocused' Value='True'><Setter TargetName='surface' Property='BorderThickness' Value='2'/><Setter TargetName='surface' Property='BorderBrush' Value='White'/></Trigger>
            </ControlTemplate.Triggers>
          </ControlTemplate></Setter.Value></Setter></Style>"));
        Content = BuildShell();
        ShowHome();
        Closing += OnClosing;
    }

    private UIElement BuildShell()
    {
        Grid shell = new Grid();
        shell.RowDefinitions.Add(new RowDefinition { Height = new GridLength(92) });
        shell.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
        shell.RowDefinitions.Add(new RowDefinition { Height = new GridLength(38) });

        Border header = new Border { Padding = new Thickness(34, 20, 34, 16), Background = new LinearGradientBrush(Color.FromRgb(20, 28, 42), Color.FromRgb(15, 20, 29), 0) };
        StackPanel heading = new StackPanel();
        heading.Children.Add(new TextBlock { Text = "TF3 Multiplayer", FontSize = 27, FontWeight = FontWeights.SemiBold });
        heading.Children.Add(new TextBlock { Text = "Experimental multiplayer • Connection and save sharing", Foreground = mutedBrush, FontSize = 14, Margin = new Thickness(1, 3, 0, 0) });
        header.Child = heading; Grid.SetRow(header, 0); shell.Children.Add(header);

        page = new Grid { Margin = new Thickness(34, 24, 34, 24) };
        ScrollViewer viewport = new ScrollViewer { Content = page, VerticalScrollBarVisibility = ScrollBarVisibility.Auto, HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled };
        Grid.SetRow(viewport, 1); shell.Children.Add(viewport);

        Border footer = new Border { Background = new SolidColorBrush(Color.FromRgb(11, 15, 22)), Padding = new Thickness(34, 9, 34, 7) };
        statusText = new TextBlock { Text = "Ready", Foreground = new SolidColorBrush(Color.FromRgb(133, 210, 157)), FontSize = 12 };
        footer.Child = statusText; Grid.SetRow(footer, 2); shell.Children.Add(footer);
        return shell;
    }

    private void ShowHome()
    {
        page.Children.Clear(); page.RowDefinitions.Clear(); page.ColumnDefinitions.Clear();
        page.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        page.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
        page.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        TextBlock intro = new TextBlock { Text = "What would you like to do?", FontSize = 22, FontWeight = FontWeights.Medium, Margin = new Thickness(4, 0, 0, 22) };
        Grid.SetRow(intro, 0); page.Children.Add(intro);

        Grid cards = new Grid();
        cards.ColumnDefinitions.Add(new ColumnDefinition()); cards.ColumnDefinitions.Add(new ColumnDefinition());
        Border host = ActionCard("Host", "Choose a save and create one private code for Internet or LAN play.", "HOST A SESSION", HostClicked, Color.FromRgb(67, 118, 232));
        Border join = ActionCard("Join", "Enter the host's code. The save is downloaded and verified automatically.", "ENTER JOIN CODE", JoinClicked, Color.FromRgb(38, 166, 126));
        host.Margin = new Thickness(0, 0, 10, 0); join.Margin = new Thickness(10, 0, 0, 0);
        Grid.SetColumn(host, 0); Grid.SetColumn(join, 1); cards.Children.Add(host); cards.Children.Add(join);
        Grid.SetRow(cards, 1); page.Children.Add(cards);

        Button debug = LinkButton("Debug tools and logs", DebugClicked); debug.HorizontalAlignment = HorizontalAlignment.Center; debug.Margin = new Thickness(0, 22, 0, 0);
        Grid.SetRow(debug, 2); page.Children.Add(debug);
        SetStatus("Ready");
    }

    private Border ActionCard(string title, string description, string buttonText, RoutedEventHandler action, Color color)
    {
        Border card = new Border { Background = cardBrush, CornerRadius = new CornerRadius(14), Padding = new Thickness(28), BorderBrush = new SolidColorBrush(Color.FromRgb(43, 54, 72)), BorderThickness = new Thickness(1) };
        Grid grid = new Grid(); grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto }); grid.RowDefinitions.Add(new RowDefinition()); grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        TextBlock titleBlock = new TextBlock { Text = title, FontSize = 28, FontWeight = FontWeights.SemiBold };
        TextBlock detail = new TextBlock { Text = description, TextWrapping = TextWrapping.Wrap, Foreground = mutedBrush, FontSize = 15, LineHeight = 23, Margin = new Thickness(0, 12, 0, 20) };
        Button button = PrimaryButton(buttonText, action, color); button.HorizontalAlignment = HorizontalAlignment.Stretch;
        Grid.SetRow(titleBlock, 0); Grid.SetRow(detail, 1); Grid.SetRow(button, 2); grid.Children.Add(titleBlock); grid.Children.Add(detail); grid.Children.Add(button); card.Child = grid; return card;
    }

    private Button PrimaryButton(string text, RoutedEventHandler action, Color color)
    {
        Button button = new Button { Content = text, Height = 48, Padding = new Thickness(18, 0, 18, 0), Background = new SolidColorBrush(color), Foreground = Brushes.White, BorderThickness = new Thickness(0), FontWeight = FontWeights.SemiBold, Cursor = System.Windows.Input.Cursors.Hand };
        button.Click += action; return button;
    }

    private Button LinkButton(string text, RoutedEventHandler action)
    {
        Button button = new Button { Content = text, Padding = new Thickness(15, 8, 15, 8), Background = Brushes.Transparent, Foreground = mutedBrush, BorderThickness = new Thickness(0), Cursor = System.Windows.Input.Cursors.Hand };
        button.Click += action; return button;
    }

    private void HostClicked(object sender, RoutedEventArgs e)
    {
        if (busy || helper != null) { SetStatus("Stop the current session before starting another."); return; }
        string save = ChooseSave();
        if (save == null) return;
        if (!EnsureModAvailable(Path.GetDirectoryName(save))) return;
        HostSetupDialog setupDialog = new HostSetupDialog(FindPrivateAddress()) { Owner = this };
        if (setupDialog.ShowDialog() != true) return;
        HostNetworkDetails network = setupDialog.Details;
        string selectedSave = save;
        RunBusy("Preparing host...", delegate
        {
            modHash = ValidateAndGetModHash();
            secret = GenerateSecret();
            string session = Guid.NewGuid().ToString();
            long expiresAt = UnixNowMilliseconds() + (30L * 60L * 1000L);
            string code = CreateJoinCode(network.JoinAddress, session, secret, modHash, expiresAt);
            Dispatcher.Invoke(delegate
            {
                StartHelper(new string[] { "src/cli.mjs", "host", "--session", session, "--mod-hash", modHash, "--bind", network.BindAddress, "--port", GamePort.ToString(), "--save-port", SavePort.ToString(), "--expires", expiresAt.ToString(), "--save", selectedSave }, "Host");
                hostReady = delegate { ShowHostReady(code, Path.GetFileName(selectedSave), network, expiresAt); };
                SetStatus("Starting host and preparing save…");
            });
        });
    }

    private void JoinClicked(object sender, RoutedEventArgs e)
    {
        if (busy || helper != null) { SetStatus("Stop the current session before starting another."); return; }
        JoinCodeDialog dialog = new JoinCodeDialog { Owner = this };
        if (dialog.ShowDialog() != true) return;
        JoinDetails details;
        try { details = ParseJoinCode(dialog.Code); } catch (Exception exception) { MessageBox.Show(this, exception.Message, "Invalid join code", MessageBoxButton.OK, MessageBoxImage.Error); return; }
        string saveDir = FindSaveDirectory();
        if (saveDir == null) saveDir = ChooseFolder();
        if (saveDir == null) return;
        string destination = saveDir;
        if (!EnsureModAvailable(destination)) return;
        string safeSession = Regex.Replace(details.Session, "[^a-zA-Z0-9_-]", "_");
        joiningSaveName = "TF3MP_" + safeSession.Substring(0, Math.Min(48, safeSession.Length)) + ".sav";
        RunBusy("Checking compatibility...", delegate
        {
            string localHash = ValidateAndGetModHash();
            if (!String.Equals(localHash, details.ModHash, StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("Your TF3MP mod differs from the host. Update it before joining.");
            Dispatcher.Invoke(delegate
            {
                secret = details.Secret;
                StartHelper(new string[] { "src/cli.mjs", "join", "--host", details.Address, "--port", details.Port.ToString(), "--save-port", details.SavePort.ToString(), "--session", details.Session, "--name", Environment.UserName, "--mod-hash", details.ModHash, "--save-dir", destination }, "Client");
                ShowJoinProgress(details.Address);
            });
        });
    }

    private void ShowHostReady(string code, string saveName, HostNetworkDetails network, long expiresAt)
    {
        page.Children.Clear(); page.RowDefinitions.Clear(); page.ColumnDefinitions.Clear();
        StackPanel content = new StackPanel { MaxWidth = 680, HorizontalAlignment = HorizontalAlignment.Center };
        content.Children.Add(new TextBlock { Text = "Host is ready", FontSize = 27, FontWeight = FontWeights.SemiBold, HorizontalAlignment = HorizontalAlignment.Center });
        DateTime expiresLocal = new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc).AddMilliseconds(expiresAt).ToLocalTime();
        content.Children.Add(new TextBlock { Text = "Share this private code with the joining player. New joins close at " + expiresLocal.ToString("HH:mm") + ".", Foreground = mutedBrush, FontSize = 14, Margin = new Thickness(0, 8, 0, 18), HorizontalAlignment = HorizontalAlignment.Center });
        Expander codeDetails = new Expander { Header = "Show private join code", Foreground = mutedBrush, Margin = new Thickness(0, 8, 0, 8) };
        codeDetails.Content = new TextBox { Text = code, IsReadOnly = true, TextWrapping = TextWrapping.Wrap, Padding = new Thickness(14), Background = new SolidColorBrush(Color.FromRgb(11, 16, 24)), Foreground = Brushes.White, BorderBrush = accentBrush, MaxHeight = 140, VerticalScrollBarVisibility = ScrollBarVisibility.Auto, FontFamily = new FontFamily("Consolas"), FontSize = 13 };
        content.Children.Add(codeDetails);
        Button copy = PrimaryButton("COPY JOIN CODE", delegate { Clipboard.SetText(code); SetStatus("Join code copied"); }, Color.FromRgb(67, 118, 232)); copy.Margin = new Thickness(0, 12, 0, 8); content.Children.Add(copy);
        string networkText = network.IsInternet
            ? "Before they join: forward TCP ports 37333–37334 to " + network.LocalAddress + ".\nPublic endpoint in code: " + network.JoinAddress
            : "Local-network address: " + network.JoinAddress;
        content.Children.Add(new TextBlock { Text = "Save: " + saveName + "\n" + networkText, TextAlignment = TextAlignment.Center, TextWrapping = TextWrapping.Wrap, Foreground = mutedBrush, HorizontalAlignment = HorizontalAlignment.Center, Margin = new Thickness(0, 10, 0, 16) });
        StackPanel buttons = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Center };
        buttons.Children.Add(PrimaryButton("START TF3", delegate { StartGameWithInstructions(saveName, true); }, Color.FromRgb(38, 166, 126)));
        Button stop = LinkButton("Stop and return", StopAndHomeClicked); stop.Margin = new Thickness(12, 0, 0, 0); buttons.Children.Add(stop); content.Children.Add(buttons);
        content.Children.Add(new TextBlock { Text = "Next: load this save in TF3 with TF3MP enabled.\nThe game panel will confirm the helper connection. Gameplay sync is pending.", TextWrapping = TextWrapping.Wrap, TextAlignment = TextAlignment.Center, Foreground = mutedBrush, Margin = new Thickness(0, 20, 0, 12) });
        content.Children.Add(LinkButton("Debug and connection details", DebugClicked));
        page.Children.Add(content); SetStatus("Hosting — waiting for a player");
    }

    private void ShowJoinProgress(string address)
    {
        page.Children.Clear(); page.RowDefinitions.Clear(); page.ColumnDefinitions.Clear();
        StackPanel content = new StackPanel { MaxWidth = 620, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };
        content.Children.Add(new TextBlock { Text = "Joining host", FontSize = 28, FontWeight = FontWeights.SemiBold, HorizontalAlignment = HorizontalAlignment.Center });
        content.Children.Add(new TextBlock { Text = "Authenticating and downloading the host save…", FontSize = 15, Foreground = mutedBrush, Margin = new Thickness(0, 10, 0, 24), HorizontalAlignment = HorizontalAlignment.Center });
        Border info = new Border { Background = cardBrush, CornerRadius = new CornerRadius(10), Padding = new Thickness(22) };
        info.Child = new TextBlock { Text = "Host: " + address + "\nThe save will be verified before the session becomes ready.", TextAlignment = TextAlignment.Center, Foreground = mutedBrush, LineHeight = 23 };
        content.Children.Add(info); Button cancel = LinkButton("Cancel", StopAndHomeClicked); cancel.Margin = new Thickness(0, 18, 0, 0); content.Children.Add(cancel); page.Children.Add(content);
        SetStatus("Joining — pulling host save");
    }

    private void ShowJoinReady(string saveName)
    {
        page.Children.Clear(); page.RowDefinitions.Clear(); page.ColumnDefinitions.Clear();
        StackPanel content = new StackPanel { MaxWidth = 660, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };
        content.Children.Add(new TextBlock { Text = "Save downloaded", FontSize = 29, FontWeight = FontWeights.SemiBold, HorizontalAlignment = HorizontalAlignment.Center });
        content.Children.Add(new TextBlock { Text = "The host save and required TF3MP mod were verified.", FontSize = 15, Foreground = mutedBrush, Margin = new Thickness(0, 9, 0, 22), HorizontalAlignment = HorizontalAlignment.Center });
        Border instruction = new Border { Background = cardBrush, CornerRadius = new CornerRadius(12), Padding = new Thickness(24), BorderBrush = new SolidColorBrush(Color.FromRgb(43, 54, 72)), BorderThickness = new Thickness(1) };
        instruction.Child = new TextBlock { Text = "In TF3 choose Load Game, then select:\n\n" + saveName + "\n\nTF3 will use the enabled-mod list carried by the host save.", TextAlignment = TextAlignment.Center, FontSize = 16, FontWeight = FontWeights.Medium };
        content.Children.Add(instruction);
        Button start = PrimaryButton("START TF3", delegate { StartGameWithInstructions(saveName, false); }, Color.FromRgb(38, 166, 126)); start.Margin = new Thickness(0, 18, 0, 6); content.Children.Add(start);
        content.Children.Add(LinkButton("Leave session", StopAndHomeClicked)); page.Children.Add(content); SetStatus("Save verified — ready to load in TF3");
    }

    private void DebugClicked(object sender, RoutedEventArgs e)
    {
        page.Children.Clear(); page.RowDefinitions.Clear(); page.ColumnDefinitions.Clear();
        page.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto }); page.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto }); page.RowDefinitions.Add(new RowDefinition());
        DockPanel top = new DockPanel(); Button back = LinkButton("← Back", delegate { ShowHome(); }); DockPanel.SetDock(back, Dock.Left); top.Children.Add(back);
        top.Children.Add(new TextBlock { Text = "Diagnostics", FontSize = 22, FontWeight = FontWeights.SemiBold, Margin = new Thickness(16, 5, 0, 0) }); Grid.SetRow(top, 0); page.Children.Add(top);
        StackPanel tools = new StackPanel { Margin = new Thickness(0, 12, 0, 8) };
        tools.Children.Add(new TextBlock { Text = "One guided session, one report. Use a disposable save and a fresh solo host.", Foreground = mutedBrush, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 0, 0, 10) });
        WrapPanel primaryActions = new WrapPanel();
        WrapPanel actions = new WrapPanel { Margin = new Thickness(0, 8, 0, 0) };
        actions.Children.Add(SmallButton("Validate", delegate { RunBusy("Validating...", delegate { modHash = ValidateAndGetModHash(); SetStatus("Validation passed — " + modHash.Substring(0, 12) + "…"); }); }));
        actions.Children.Add(SmallButton("Verify staged mod", delegate { RunBusy("Comparing staged mod...", delegate { if (!DirectoriesMatch(Path.Combine(projectRoot, "mod"), StagedMod)) throw new InvalidOperationException("Staged mod differs from source."); SetStatus("Staged mod matches source"); }); }));
        actions.Children.Add(SmallButton("Open project", delegate { Process.Start(projectRoot); }));
        actions.Children.Add(SmallButton("Inspect station template", delegate {
            try {
                if (helper == null || helper.HasExited) throw new InvalidOperationException("Start a fresh solo Host and load a disposable save first.");
                if (MessageBox.Show(this, "Read-only station-template investigation. Nothing will be built, bought or funded. This calls a native game evaluator that has not yet been qualified and could crash the game. Use a disposable save. Run once, then copy the station_template_result log. This is not Phase 2 acceptance. Continue?", "Station template inspection", MessageBoxButton.YesNo, MessageBoxImage.Warning, MessageBoxResult.No) != MessageBoxResult.Yes) return;
                helper.StandardInput.WriteLine("station-template-probe"); helper.StandardInput.Flush();
                SetStatus("Inspecting station template • read-only • no building or spending");
            } catch (Exception ex) { SetStatus(ex.Message); }
        }));
        actions.Children.Add(SmallButton("Phase 2: depot preview", delegate {
            try {
                if (helper == null || helper.HasExited) throw new InvalidOperationException("Start a fresh solo Host and load your disposable save with the existing test company.");
                helper.StandardInput.WriteLine("depot-preview"); helper.StandardInput.Flush();
                SetStatus("Preparing read-only company tools in game • no building or spending");
            } catch (Exception ex) { SetStatus(ex.Message); }
        }));
        batchStartButton = SmallButton("Run local sync test", delegate {
            try {
                if (helper == null || helper.HasExited) throw new InvalidOperationException("Start a fresh solo Host and load a disposable save first.");
                if (guidedBatchOwnsHelper) throw new InvalidOperationException("The current guided diagnostic owns this helper. Stop it before starting local sync.");
                if (MessageBox.Show(this, "CONTROLLED SINGLE-GAME SYNC TEST. Use a disposable save with the existing test company, from before previous coordination tests. Start at 1x speed.\n\nAfter starting, open a running vehicle you own and click Use for sync test in its window. The helper reads the company IDs automatically; it does not create or fund a company.\n\nDo not build, buy/sell, edit lines, switch company, or use native speed/vehicle controls during the run. It captures a checkpoint, runs four coordinated Stop/Start actions across 1x, 2x and 4x speed, and ends with a verified pause. Unknown outcomes are not retried.\n\nOnly ONE game is tested. The second protocol participant mirrors receipts; this is NOT a multiplayer proof. A JSON report is saved under reports. On failure, pause manually if needed and Stop helper. Start?", "Coordinated local sync test", MessageBoxButton.YesNo, MessageBoxImage.Warning, MessageBoxResult.No) != MessageBoxResult.Yes) return;
                helper.StandardInput.WriteLine("coordinator-run-confirmed"); helper.StandardInput.Flush();
                guidedBatchOwnsHelper = true;
                batchStartButton.IsEnabled = false;
                if (advancedDiagnostics != null) { advancedDiagnostics.IsExpanded = false; advancedDiagnostics.IsEnabled = false; }
            } catch (Exception ex) { SetStatus(ex.Message); }
        });
        batchStartButton.IsEnabled = !guidedBatchOwnsHelper;
        primaryActions.Children.Add(batchStartButton);
        batchConfirmButton = SmallButton("Confirm batch controls", delegate {
            try {
                if (helper == null || helper.HasExited) throw new InvalidOperationException("The helper is not running.");
                MessageBoxResult result = MessageBox.Show(this, "Confirm ALL checks: speed buttons and keyboard shortcuts could not resume the game; the native vehicle Start/Stop toggle did not change its stopped state; the vehicle manager showed the TalCo restriction message.\n\nYes: record confirmation, restore controls, briefly resume, then run the final engine watchdog expiry check. The batch ends paused.\nNo: record a failure; stop the helper next.\nCancel: keep waiting while you check.", "Confirm observed controls", MessageBoxButton.YesNoCancel, MessageBoxImage.Question, MessageBoxResult.Cancel);
                if (result == MessageBoxResult.Cancel) return;
                helper.StandardInput.WriteLine(result == MessageBoxResult.Yes ? "integration-batch-controls-confirmed" : "integration-batch-controls-failed"); helper.StandardInput.Flush();
                batchControlsReady = false; batchConfirmButton.IsEnabled = false;
            } catch (Exception ex) { SetStatus(ex.Message); }
        });
        batchConfirmButton.IsEnabled = batchControlsReady;
        batchConfirmButton.ToolTip = "Available when the batch asks you to check speed inputs, native vehicle toggle and manager restrictions.";
        phase2SetupButton = SmallButton("Phase 2: service setup", delegate {
            try {
                if (helper == null || helper.HasExited) throw new InvalidOperationException("Start a fresh solo Host and load the paused disposable save with the existing test company first.");
                if (guidedBatchOwnsHelper) throw new InvalidOperationException("The current guided diagnostic owns this helper. Stop it before starting disposable service setup.");
                if (MessageBox.Show(this, "DISPOSABLE SAVE ONLY — READ THIS FIRST.\n\nThis first step does not fund, build, buy, or create a line. It prepares read-only in-game Company tools only. Use a fresh solo Host with the existing paused, zero-balance test company.\n\n1. Pause the game.\n2. In Company tools, select one depot position, two station positions, and a bus.\n3. Submit the locations in the game.\n4. Return here and explicitly confirm the prepared plan.\n\nThe later confirmation funds only the target company by 1,000,000, builds the selected depot and stations, buys the selected bus and creates a line. The helper verifies the original company is unchanged and stops if it detects a mismatch. Unqualified native calls may crash TF3; there is no automatic retry. The game remains paused. This is setup only, not Phase 2 completion, and TF3 will not be launched automatically.\n\nPrepare the read-only location selection now?", "Phase 2 disposable service setup", MessageBoxButton.YesNo, MessageBoxImage.Warning, MessageBoxResult.No) != MessageBoxResult.Yes) return;
                ResetPhase2SetupUi();
                guidedBatchOwnsHelper = true;
                phase2SetupButton.IsEnabled = false;
                if (batchStartButton != null) batchStartButton.IsEnabled = false;
                if (advancedDiagnostics != null) { advancedDiagnostics.IsExpanded = false; advancedDiagnostics.IsEnabled = false; }
                helper.StandardInput.WriteLine("phase2-setup"); helper.StandardInput.Flush();
                SetStatus("Phase 2 setup • pause game, select depot + two stations + bus in Company tools, then submit");
            } catch (Exception ex) { SetStatus(ex.Message); }
        });
        phase2SetupConfirmButton = SmallButton("Confirm disposable setup", delegate {
            try {
                string planHash = pendingPhase2SetupHash;
                if (helper == null || helper.HasExited) throw new InvalidOperationException("The helper is not running.");
                if (phase2SetupConfirmed || !IsPhase2SetupHash(planHash)) throw new InvalidOperationException("No current Phase 2 setup plan is ready to confirm.");
                if (MessageBox.Show(this, "CONFIRM DISPOSABLE SETUP?\n\nOriginal company: " + pendingPhase2OriginalCompany + "\nTarget company: " + pendingPhase2TargetCompany + "\nFunding amount: " + pendingPhase2FundingAmount.ToString("N0") + "\n\nThis funds only the target company, then builds the selected depot and two stations, buys the selected bus, and creates a line. The helper verifies the original company is unchanged and stops if it detects a mismatch. It may crash TF3 because native actions are not fully qualified. There is no automatic retry or rollback; leave the game paused and inspect uncertain outcomes manually.\n\nThis is not Phase 2 completion and does not launch TF3. Proceed?", "Confirm disposable setup", MessageBoxButton.YesNo, MessageBoxImage.Warning, MessageBoxResult.No) != MessageBoxResult.Yes) return;
                phase2SetupConfirmed = true;
                ClearPendingPhase2SetupPlan();
                phase2SetupConfirmButton.IsEnabled = false;
                phase2SetupConfirmButton.Visibility = Visibility.Collapsed;
                helper.StandardInput.WriteLine("phase2-setup-confirm " + planHash); helper.StandardInput.Flush();
                SetStatus("Phase 2 setup confirmed • helper is executing once • leave the game paused");
            } catch (Exception ex) { SetStatus(ex.Message); }
        });
        phase2SetupConfirmButton.IsEnabled = false;
        phase2SetupConfirmButton.Visibility = Visibility.Collapsed;
        phase2SetupButton.IsEnabled = !guidedBatchOwnsHelper;
        if (!phase2SetupConfirmed && HasPendingPhase2SetupPlan()) { phase2SetupConfirmButton.Visibility = Visibility.Visible; phase2SetupConfirmButton.IsEnabled = true; }
        primaryActions.Children.Add(phase2SetupButton);
        primaryActions.Children.Add(phase2SetupConfirmButton);
        // Legacy diagnostic confirmation is not part of the coordinated run.
        primaryActions.Children.Add(SmallButton("Open batch reports", delegate {
            string folder = Path.Combine(projectRoot, "reports");
            if (Directory.Exists(folder)) Process.Start(folder); else SetStatus("No batch reports yet");
        }));
        primaryActions.Children.Add(SmallButton("Stop helper", delegate { StopHelper(); }));
        actions.Children.Add(SmallButton("Test engine bridge", delegate {
            try {
                if (helper == null || helper.HasExited) throw new InvalidOperationException("Start Host or Join and load your mod-enabled save first.");
                helper.StandardInput.WriteLine("engine-probe");
                helper.StandardInput.Flush();
                SetStatus("Testing engine bridge • no gameplay changes");
            } catch (Exception error) { SetStatus(error.Message); }
        }));
        actions.Children.Add(SmallButton("Test scheduled update", delegate {
            try {
                if (helper == null || helper.HasExited) throw new InvalidOperationException("Start Host or Join and load your mod-enabled save first.");
                helper.StandardInput.WriteLine("timing-probe");
                helper.StandardInput.Flush();
                SetStatus("Testing exact-update scheduling • run the simulation • no gameplay changes");
            } catch (Exception error) { SetStatus(error.Message); }
        }));
        actions.Children.Add(SmallButton("Enable local vehicle test", delegate {
            try {
                if (helper == null || helper.HasExited) throw new InvalidOperationException("Start Host and load a disposable mod-enabled save first.");
                if (MessageBox.Show(this, "This experimental test changes real vehicles in your loaded save. Use a disposable copy.\n\nRemote joining will be blocked until you restart the helper. In a vehicle window, use MP test Stop / Start, one request at a time.\n\nWait for the outcome before stopping the helper: an already delivered command may still execute. This is NOT multiplayer synchronization. Enable?", "Local vehicle test", MessageBoxButton.YesNo, MessageBoxImage.Warning) != MessageBoxResult.Yes) return;
                helper.StandardInput.WriteLine("vehicle-test-enable");
                helper.StandardInput.Flush();
                SetStatus("Requesting local vehicle test • host only • see Debug log");
            } catch (Exception error) { SetStatus(error.Message); }
        }));
        actions.Children.Add(SmallButton("Test pause barrier", delegate {
            try {
                if (helper == null || helper.HasExited) throw new InvalidOperationException("Start a fresh solo Host and load a disposable save at normal (1x) speed.");
                if (MessageBox.Show(this, "DISPOSABLE SAVE ONLY. This pauses the loaded game once and sends a fresh diagnostic event while paused. It does not enable multiplayer or lock normal controls.\n\nWait for 'Paused event passed', then click Release pause test. Do not touch game speed controls during the test.\n\nIf it fails or the helper closes, stop the helper and resume using the game's normal controls. No automatic resume, undo or retry. Do not reload with this helper active.\n\nStart the pause test?", "Local pause diagnostic", MessageBoxButton.YesNo, MessageBoxImage.Warning, MessageBoxResult.No) != MessageBoxResult.Yes) return;
                helper.StandardInput.WriteLine("pause-test-confirmed"); helper.StandardInput.Flush();
            } catch (Exception ex) { SetStatus(ex.Message); }
        }));
        actions.Children.Add(SmallButton("Test exact-update hold", delegate {
            try {
                if (helper == null || helper.HasExited) throw new InvalidOperationException("Start a fresh solo Host and load a disposable save at normal (1x) speed.");
                if (MessageBox.Show(this, "DISPOSABLE SAVE ONLY. This schedules a pause 40 simulation updates ahead (typically about eight seconds). The engine rejects early or late delivery without pausing.\n\nKeep normal 1x speed and do not touch game controls. Wait for 'Paused event passed', then click Release pause test. This test does not change vehicles or enable multiplayer.\n\nIf anything fails, stop the helper and resume manually if paused. Do not retry, reload or enable other tests in this session. Start?", "Exact-update hold diagnostic", MessageBoxButton.YesNo, MessageBoxImage.Warning, MessageBoxResult.No) != MessageBoxResult.Yes) return;
                helper.StandardInput.WriteLine("pause-test-scheduled-confirmed"); helper.StandardInput.Flush();
            } catch (Exception ex) { SetStatus(ex.Message); }
        }));
        actions.Children.Add(SmallButton("Test vehicle + hold", delegate {
            try {
                if (helper == null || helper.HasExited) throw new InvalidOperationException("Start a fresh solo Host and load an untouched disposable save at 1x.");
                if (MessageBox.Show(this, "DISPOSABLE SAVE ONLY. Open an owned running vehicle's window first.\n\nThis holds the simulation 40 updates ahead. When Debug asks, click MP test Stop ONCE in the vehicle window while paused. The action must apply without advancing the held update.\n\nWait for 'Vehicle action held', then click Release pause test. Do not use normal speed or vehicle buttons. No other tests or joining players in this helper session.\n\nFailures are not retried or undone. Stop the helper and resume manually if needed. Start?", "Vehicle plus hold diagnostic", MessageBoxButton.YesNo, MessageBoxImage.Warning, MessageBoxResult.No) != MessageBoxResult.Yes) return;
                helper.StandardInput.WriteLine("combined-test-confirmed"); helper.StandardInput.Flush();
            } catch (Exception ex) { SetStatus(ex.Message); }
        }));
        actions.Children.Add(SmallButton("Test speed controls", delegate {
            try {
                if (helper == null || helper.HasExited) { SetStatus("Start a solo host and complete an exact hold first"); return; }
                if (MessageBox.Show(this, "DISPOSABLE SAVE ONLY. First run Test exact hold and wait for Paused event passed.\n\nThis temporarily disables normal speed inputs without resuming. After Speed controls locked, try the normal pause/speed buttons and shortcuts: the simulation must stay paused.\n\nThen click Restore speed controls, wait for confirmation, and Release pause test. If anything fails, Stop helper and check controls restore before manually resuming. No other tests or joining players. Continue?", "Temporary speed-control diagnostic", MessageBoxButton.YesNo, MessageBoxImage.Warning, MessageBoxResult.No) != MessageBoxResult.Yes) return;
                helper.StandardInput.WriteLine("control-test-confirmed"); helper.StandardInput.Flush();
            } catch { SetStatus("Control request failed • stop helper and check the game"); }
        }));
        actions.Children.Add(SmallButton("Restore speed controls", delegate {
            try {
                if (helper == null || helper.HasExited) { SetStatus("Helper is not running • check normal controls in game"); return; }
                helper.StandardInput.WriteLine("control-test-release"); helper.StandardInput.Flush();
            } catch { SetStatus("Restore request failed • stop helper and check the game"); }
        }));
        actions.Children.Add(SmallButton("Release pause test", delegate {
            try {
                if (helper == null || helper.HasExited) throw new InvalidOperationException("Helper is stopped. Resume using the game's normal controls.");
                helper.StandardInput.WriteLine("pause-test-release"); helper.StandardInput.Flush();
            } catch (Exception ex) { SetStatus(ex.Message); }
        }));
        actions.Children.Add(SmallButton("Create test company", delegate {
            try {
                if (helper == null || helper.HasExited) throw new InvalidOperationException("Start a fresh solo Host and load a disposable mod-enabled save first.");
                if (MessageBox.Show(this, "This creates a real additional company in the LOADED game, not necessarily the save selected in the launcher. Use a disposable copy only.\n\nKeep the simulation running. Do not enable vehicle testing. Remote joining will be blocked until the helper restarts.\n\nThere is no automatic undo. Do not retry uncertain outcomes or reload a save while this helper is active. Creation alone does NOT prove multiplayer or separate finances.\n\nCreate one test company now?", "Disposable-save company test", MessageBoxButton.YesNo, MessageBoxImage.Warning, MessageBoxResult.No) != MessageBoxResult.Yes) return;
                helper.StandardInput.WriteLine("company-test-create-confirmed"); helper.StandardInput.Flush();
                SetStatus("Company test requested • do not repeat • see Debug log");
            } catch (Exception error) { SetStatus(error.Message); }
        }));
        actions.Children.Add(SmallButton("Inspect test companies", delegate {
            try {
                if (helper == null || helper.HasExited) throw new InvalidOperationException("Start Host and load the disposable save containing the created company.");
                helper.StandardInput.WriteLine("company-inspect"); helper.StandardInput.Flush();
                SetStatus("Reading both companies • no gameplay changes");
            } catch (Exception error) { SetStatus(error.Message); }
        }));
        actions.Children.Add(SmallButton("Test company accounting", delegate {
            try {
                if (helper == null || helper.HasExited) throw new InvalidOperationException("Start a fresh solo Host and load the disposable save containing your test company.");
                if (MessageBox.Show(this, "DISPOSABLE SAVE ONLY. This changes real finances in the loaded game.\n\nIt credits the test company by 1,000, verifies the original company is unchanged, then debits 1,000 only after an exact successful credit. A successful test leaves the balance unchanged but retains journal entries.\n\nIf anything is uncertain it stops without retry or automatic repair, so the extra funds may remain. No vehicle is bought and no depot is transferred.\n\nKeep simulation running; do not reload or stop the helper while pending. Run once?", "Company accounting experiment", MessageBoxButton.YesNo, MessageBoxImage.Warning, MessageBoxResult.No) != MessageBoxResult.Yes) return;
                helper.StandardInput.WriteLine("finance-test-confirmed"); helper.StandardInput.Flush();
                SetStatus("Accounting test requested • disposable save • do not repeat");
            } catch (Exception error) { SetStatus(error.Message); }
        }));
        ComboBox vehicleLead = new ComboBox { Width = 190, Height = 38, Margin = new Thickness(0, 0, 9, 0), SelectedIndex = 2 };
        vehicleLead.Items.Add("20 updates (~4s, experimental)");
        vehicleLead.Items.Add("40 updates (~8s, experimental)");
        vehicleLead.Items.Add("60 updates (~12s, tested)");
        vehicleLead.SelectedIndex = 2;
        actions.Children.Add(vehicleLead);
        actions.Children.Add(SmallButton("Enable scheduled vehicle test", delegate {
            try {
                if (helper == null || helper.HasExited) throw new InvalidOperationException("Start a fresh Host and load a disposable mod-enabled save first.");
                if (MessageBox.Show(this, "Experimental exact-update vehicle test. Use a disposable save.\n\nDo NOT enable the immediate test in this session. Remote joining is blocked. Keep normal speed, do not pause, reload or change saves.\n\nClick MP test Stop once in the vehicle window and wait for the result. Early/late delivery is rejected, not retried. This is not multiplayer synchronization. Enable?", "Scheduled local vehicle test", MessageBoxButton.YesNo, MessageBoxImage.Warning) != MessageBoxResult.Yes) return;
                int leadUpdates = new int[] { 20, 40, 60 }[vehicleLead.SelectedIndex];
                helper.StandardInput.WriteLine("vehicle-test-scheduled-enable " + leadUpdates);
                helper.StandardInput.Flush();
                SetStatus("Requesting scheduled local test • fresh solo Host required");
            } catch (Exception error) { SetStatus(error.Message); }
        }));
        actions.Children.Add(SmallButton("Disable vehicle test", delegate {
            try {
                if (helper == null || helper.HasExited) throw new InvalidOperationException("No running helper.");
                if (MessageBox.Show(this, "This removes pending delivery and blocks further test requests. It CANNOT undo a command already delivered to the engine. Inspect the vehicle afterward. Restart Host to enable again. Continue?", "Disable vehicle test", MessageBoxButton.YesNo, MessageBoxImage.Warning) != MessageBoxResult.Yes) return;
                helper.StandardInput.WriteLine("vehicle-test-disable"); helper.StandardInput.Flush();
                SetStatus("Requesting disable • already delivered actions cannot be recalled");
            } catch (Exception error) { SetStatus(error.Message); }
        }));
        actions.Children.Add(SmallButton("Run offline checks", delegate {
            RunBusy("Running offline automated checks • game is not used", delegate {
                RunCaptured("node.exe", new string[] { "--test", "--test-isolation=none", "test/*.test.mjs" });
                SetStatus("Offline checks passed • synthetic tests, not TF3 gameplay verification");
            });
        }));
        primaryActions.Children.Add(SmallButton("Copy logs", delegate {
            try { Clipboard.SetText(logHistory.ToString()); SetStatus("Diagnostic logs copied"); }
            catch (Exception error) { SetStatus("Could not copy logs: " + error.Message); }
        }));
        tools.Children.Add(primaryActions);
        StackPanel advancedContent = new StackPanel();
        advancedContent.Children.Add(new TextBlock { Text = "Individual experiments and maintenance. Not needed for the guided batch; do not mix tests in one helper session.", Foreground = mutedBrush, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 8, 0, 4) });
        advancedContent.Children.Add(new ScrollViewer { Content = actions, MaxHeight = 170, VerticalScrollBarVisibility = ScrollBarVisibility.Auto, HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled });
        advancedDiagnostics = new Expander { Header = "Advanced — individual diagnostics", IsExpanded = false, IsEnabled = !guidedBatchOwnsHelper, Content = advancedContent, Foreground = mutedBrush, Margin = new Thickness(0, 6, 0, 0) };
        tools.Children.Add(advancedDiagnostics);
        Grid.SetRow(tools, 1); page.Children.Add(tools);
        logBox = new TextBox { IsReadOnly = true, AcceptsReturn = true, TextWrapping = TextWrapping.NoWrap, VerticalScrollBarVisibility = ScrollBarVisibility.Auto, HorizontalScrollBarVisibility = ScrollBarVisibility.Auto, Background = new SolidColorBrush(Color.FromRgb(8, 12, 18)), Foreground = new SolidColorBrush(Color.FromRgb(196, 207, 221)), BorderBrush = new SolidColorBrush(Color.FromRgb(43, 54, 72)), FontFamily = new FontFamily("Consolas"), FontSize = 12, Padding = new Thickness(12), Text = "Debug output appears here. Secrets and save paths are not logged.\n" };
        Grid.SetRow(logBox, 2); page.Children.Add(logBox); SetStatus(helper != null && !helper.HasExited ? "Helper running" : "Debug mode");
        logBox.Text = logHistory.ToString();
    }

    private Button SmallButton(string text, RoutedEventHandler action) { Button b = PrimaryButton(text, action, Color.FromRgb(49, 65, 88)); b.Height = 38; b.Margin = new Thickness(0, 0, 9, 8); return b; }

    private void StartGameClicked(object sender, RoutedEventArgs e)
    {
        if (!File.Exists(GameExe)) { MessageBox.Show(this, "TF3 executable was not found.", "TF3 Multiplayer", MessageBoxButton.OK, MessageBoxImage.Error); return; }
        try { Process.Start(new ProcessStartInfo { FileName = GameExe, WorkingDirectory = Path.GetDirectoryName(GameExe), UseShellExecute = true }); SetStatus("TF3 started"); }
        catch (Exception exception) { MessageBox.Show(this, exception.Message, "Could not start TF3", MessageBoxButton.OK, MessageBoxImage.Error); }
    }

    private void StartGameWithInstructions(string saveName, bool hostSide)
    {
        StartGameClicked(this, new RoutedEventArgs());
        MessageBox.Show(this, "Choose " + (hostSide ? "Continue or Load Game" : "Load Game") + " in TF3 and select:\n\n" + saveName + "\n\nThe save's enabled-mod list should activate TF3MP automatically. If TF3 reports the mod missing, stop instead of loading.", hostSide ? "Load the hosted save" : "Load the downloaded host save", MessageBoxButton.OK, MessageBoxImage.Information);
        SetStatus("In TF3, load: " + saveName);
    }

    private void StopAndHomeClicked(object sender, RoutedEventArgs e) { StopHelper(); ShowHome(); }

    private void StartHelper(string[] args, string label)
    {
        StopHelper();
        sessionFailure = null;
        string saveDirectory = FindSaveDirectory();
        if (saveDirectory != null) args = args.Concat(new string[] { "--bridge-dir", Path.Combine(Directory.GetParent(saveDirectory).FullName, "tf3mp_status_1") }).ToArray();
        ProcessStartInfo info = new ProcessStartInfo("node.exe", JoinArguments(args)) { WorkingDirectory = projectRoot, UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true, RedirectStandardInput = true };
        info.EnvironmentVariables["TF3MP_SESSION_SECRET"] = secret;
        Process process = new Process { StartInfo = info, EnableRaisingEvents = true };
        process.OutputDataReceived += delegate(object s, DataReceivedEventArgs a) { if (a.Data != null) Dispatcher.BeginInvoke((Action)delegate { if (helper == process) HelperLine(a.Data); }); };
        process.ErrorDataReceived += delegate(object s, DataReceivedEventArgs a) { if (a.Data != null) HelperLine("ERROR: " + a.Data); };
        process.Exited += delegate { Dispatcher.BeginInvoke((Action)delegate { if (helper == process) { helper = null; ResetBatchUi(); SetStatus(sessionFailure ?? "Session ended"); } }); };
        if (!process.Start()) throw new InvalidOperationException("Node.js did not start.");
        helper = process; process.BeginOutputReadLine(); process.BeginErrorReadLine(); AppendLog(label + " helper started.");
    }

    private void HelperLine(string line)
    {
        AppendLog(line);
        try {
            var message = new JavaScriptSerializer().Deserialize<System.Collections.Generic.Dictionary<string, object>>(line);
            object value;
            string eventName = message.TryGetValue("event", out value) ? value as string : "";
            string kind = message.TryGetValue("kind", out value) ? value as string : "";
            string code = message.TryGetValue("code", out value) ? value as string : "";
            if (eventName == "phase2_setup") {
                string planHash = message.TryGetValue("planHash", out value) ? value as string : null;
                if (code == "PLAN_READY") {
                    ClearPendingPhase2SetupPlan();
                    if (phase2SetupConfirmButton != null) { phase2SetupConfirmButton.IsEnabled = false; phase2SetupConfirmButton.Visibility = Visibility.Collapsed; }
                    object originalCompany, targetCompany, fundingAmount;
                    if (!phase2SetupConfirmed && IsPhase2SetupHash(planHash) &&
                        message.TryGetValue("originalCompany", out originalCompany) && message.TryGetValue("targetCompany", out targetCompany) && message.TryGetValue("fundingAmount", out fundingAmount) &&
                        TryPhase2SetupCompanies(originalCompany, targetCompany, fundingAmount, out pendingPhase2OriginalCompany, out pendingPhase2TargetCompany, out pendingPhase2FundingAmount)) {
                        pendingPhase2SetupHash = planHash.ToLowerInvariant();
                        if (phase2SetupConfirmButton != null) { phase2SetupConfirmButton.Visibility = Visibility.Visible; phase2SetupConfirmButton.IsEnabled = true; }
                        SetStatus("Phase 2 plan ready for target company " + pendingPhase2TargetCompany + " • review locations, then Confirm disposable setup");
                    } else SetStatus("Phase 2 setup sent an invalid or stale plan • select locations and submit again");
                } else if (code == "SELECT_LOCATIONS") {
                    ClearPendingPhase2SetupPlan();
                    if (phase2SetupConfirmButton != null) { phase2SetupConfirmButton.IsEnabled = false; phase2SetupConfirmButton.Visibility = Visibility.Collapsed; }
                    SetStatus("Phase 2 setup • pause game, select depot + two stations + bus in Company tools, then submit");
                } else if (code == "RUNNING") {
                    ClearPendingPhase2SetupPlan();
                    if (phase2SetupConfirmButton != null) { phase2SetupConfirmButton.IsEnabled = false; phase2SetupConfirmButton.Visibility = Visibility.Collapsed; }
                    SetStatus("Phase 2 setup executing once • leave the game paused • no automatic retry");
                } else if (code == "SETUP_VERIFIED_SERVICE_NOT_OBSERVED") {
                    ClearPendingPhase2SetupPlan();
                    if (phase2SetupConfirmButton != null) { phase2SetupConfirmButton.IsEnabled = false; phase2SetupConfirmButton.Visibility = Visibility.Collapsed; }
                    SetStatus("Disposable setup verified • service not observed • game remains paused • not Phase 2 complete");
                } else if (code == "FAILED_STOP_HELPER") {
                    ClearPendingPhase2SetupPlan();
                    if (phase2SetupConfirmButton != null) { phase2SetupConfirmButton.IsEnabled = false; phase2SetupConfirmButton.Visibility = Visibility.Collapsed; }
                    SetStatus("Phase 2 setup stopped • inspect the game and helper log • do not retry uncertain actions");
                } else {
                    SetStatus("Phase 2 setup • " + code);
                }
                return;
            }
            if (eventName == "coordinator_local_run") {
                if (code == "SELECT_OWN_VEHICLE_USE_FOR_SYNC_TEST") SetStatus("Open your running vehicle • click Use for sync test");
                else if (code == "LOAD_DISPOSABLE_SAVE_WITH_EXISTING_TEST_COMPANY") SetStatus("Existing test company required • Stop helper and load the prepared disposable save");
                else if (code == "CAPTURE_STARTED") SetStatus("Capturing scheduled checkpoint • leave game controls untouched");
                else if (code == "WAITING_FOR_EXISTING_CONTROL_LOCK") SetStatus("Checkpoint held • acquiring tested controls");
                else if (code == "VEHICLE_ACTION_SCHEDULED") SetStatus("Coordinated vehicle action scheduled • wait for the receipt");
                else if (code == "ACTUAL_HELD_ACTION_RECEIPT") SetStatus("Vehicle action confirmed at held update");
                else if (code == "ACTUAL_RELEASE_RECEIPT") SetStatus("Resume confirmed • continuing local test");
                else if (code == "VERIFYING_EXPLICIT_ENGINE_STOP") SetStatus("Verifying final engine stop");
                else if (code == "LOCAL_RUN_PASSED_GAME_HELD") SetStatus("Local sync cycle passed • game paused • report saved • Stop helper");
                else if (code.Contains("FAILED") || code.Contains("UNKNOWN") || code.Contains("DISCONNECTED")) SetStatus("Local test stopped • inspect Debug • pause manually if needed • no retry");
                else SetStatus("Local sync test • " + code);
                return;
            }
            if (eventName == "integration_batch") {
                batchControlsReady = code == "TRY_BUTTONS_AND_SHORTCUTS_THEN_CONFIRM";
                if (batchConfirmButton != null) batchConfirmButton.IsEnabled = batchControlsReady;
                if (code == "ENGINE_PROBE_RUNNING") SetStatus("Batch 1/6 • checking the engine bridge");
                else if (code == "EXACT_HOLD_RUNNING") SetStatus("Batch 2/6 • scheduling exact hold • keep 1x speed");
                else if (code == "CLICK_MP_STOP_ONCE") SetStatus("Batch 3/6 • click MP test Stop ONCE in your vehicle window");
                else if (code == "LOCKING_SPEED_CONTROLS") SetStatus("Batch 4/6 • waiting for speed-control lock");
                else if (code == "TRY_BUTTONS_AND_SHORTCUTS_THEN_CONFIRM") SetStatus("Batch 4/6 • try speed buttons AND shortcuts • then Confirm batch controls");
                else if (code == "RESTORING_CONTROLS_THEN_RESUMING" || code == "RESUMING_AFTER_CONFIRMATION") SetStatus("Batch 5/6 • restoring controls and verifying resume");
                else if (code == "VERIFYING_TERMINAL_ENGINE_STOP") SetStatus("Batch 6/6 • waiting for engine watchdog expiry • leave speed controls untouched");
                else if (code == "LOCAL_BATCH_PASSED_REPORT_SAVED") SetStatus("Local batch passed • game paused • report saved • Stop helper when finished");
                else SetStatus("Batch: " + code + " • inspect log; do not retry uncertain actions");
            }
            // Keep all raw records in the log, but do not replace guided next-step
            // instructions with obsolete standalone-test prompts.
            if (guidedBatchOwnsHelper && eventName != "integration_batch" &&
                (eventName.StartsWith("engine_probe_") || eventName.StartsWith("pause_test_") || eventName.StartsWith("combined_test_") || eventName.StartsWith("control_test_") || eventName.StartsWith("vehicle_test_"))) return;
            if ((eventName == "halt_test_unknown" || eventName == "watchdog_test_unknown")) SetStatus("Engine stop no longer confirmed • check game and pause manually if needed");
            if (code == "BUILD_MISMATCH") { sessionFailure = "Different TF3 versions. Update both players to the same version, then retry."; SetStatus(sessionFailure); }
            if (eventName == "game_hash" && message.TryGetValue("recommended", out value)) unauditedBuild = !(value is bool && (bool)value);
            if (eventName == "host_listening" && hostReady != null) { Action ready = hostReady; hostReady = null; ready(); }
            if (eventName == "save_received") SetStatus("Save received and verified");
            if (kind == "session_ready") ShowJoinReady(joiningSaveName);
            if (eventName == "bridge_connected") SetStatus("Game connected • diagnostics active • gameplay sync pending");
            if (eventName == "bridge_disconnected") SetStatus("Game connection lost • waiting for TF3");
            if (eventName == "engine_probe_started") SetStatus("Waiting for simulation acknowledgment • up to 15 seconds");
            if (eventName == "station_template_result") SetStatus("Station inspection: " + code + " • copy Debug log • not a construction test");
            if (eventName == "held_snapshot_started") SetStatus("Reading vehicle/company state twice while held • do not click again");
            if (eventName == "held_snapshot_failed") SetStatus("Held-state snapshot failed • stop helper • do not retry the vehicle action");
            if (eventName == "pause_test_started") SetStatus(code == "EXACT_UPDATE_HOLD_TEST" ? "Exact-update hold scheduled • keep 1x speed • wait for paused-event result" : "Pause diagnostic running • do not change speed • wait for paused-event result");
            if (eventName == "pause_test_held") SetStatus("Paused event passed • now click Release pause test");
            if (eventName == "combined_test_select_vehicle") SetStatus("Held • click MP test Stop once on your running vehicle • do not release yet");
            if (eventName == "combined_test_waiting") SetStatus("Complete the held vehicle action first • do not release yet");
            if (eventName == "combined_test_action_held") SetStatus("Vehicle action held • now click Release pause test");
            if (eventName == "combined_test_passed") SetStatus("Local vehicle + hold + resume passed • multiplayer still unverified");
            if (eventName == "control_test_started") SetStatus("Waiting for speed-control restriction acknowledgement");
            if (eventName == "control_test_locked") SetStatus("Speed controls locked • try normal speed inputs • game must remain paused");
            if (eventName == "control_test_released") SetStatus("Speed controls restored • now click Release pause test");
            if (eventName == "control_test_waiting") SetStatus("Click Restore speed controls and wait before releasing pause");
            if (eventName == "control_test_failed") SetStatus("Control test failed • stop helper • native controls may stay locked; reload the disposable save before another test");
            if (eventName == "pause_test_releasing") SetStatus("Checking explicit resume and simulation progress");
            if (eventName == "pause_test_passed") SetStatus(code == "LOCAL_EXACT_HOLD_EVENT_RESUME_ONLY" ? "Local exact-update hold passed • multiplayer and control restrictions unverified" : "Local pause/event/resume passed • multiplayer barrier still unverified");
            if (eventName == "pause_test_failed") SetStatus("Pause test: " + code + " • stop helper; resume manually if paused; do not retry");
            if (eventName == "engine_probe_succeeded") SetStatus("Engine bridge test passed • gameplay sync not yet enabled");
            if (eventName == "company_test_started") SetStatus("Creating test company • disposable save • do not reload or retry");
            if (eventName == "depot_preview") SetStatus(code == "OPEN_IN_GAME_COMPANY_TOOLS" ? "In game: point at empty ground, then Preview last map position • read-only" : "Depot preview: " + code + " • no building or spending");
            if (eventName == "finance_test_started") SetStatus("Testing company accounting • real journal entries • do not retry");
            if (eventName == "finance_test_result") SetStatus(code == "passed" ? "Accounting isolation passed • vehicle purchases still untested" : "Accounting test: " + code + " • inspect balances; do not retry");
            if (eventName == "company_inspection_started") SetStatus("Reading company balances and asset counts • read-only");
            if (eventName == "company_inspection_result") SetStatus(code == "inspected" ? "Company snapshots collected • see Debug • cost attribution not yet tested" : "Company inspection: " + code + " • read-only; no company created");
            if (eventName == "company_test_result") SetStatus(code == "created" ? "Second company created • creation only; finances and simulation unverified" : "Company test: " + code + " • do not retry an uncertain outcome");
            if (eventName == "engine_probe_timeout") SetStatus("Engine test timed out • check the mod is loaded; try with the simulation running");
            if (eventName == "engine_probe_disconnected") SetStatus("Engine test stopped • game bridge disconnected");
            if (eventName == "engine_probe_rejected") SetStatus("Engine test unavailable or already running • see Debug log");
            if (eventName == "timing_probe_started") SetStatus("Waiting for scheduled update • simulation must run • up to 60 seconds");
            if (eventName == "timing_probe_succeeded") SetStatus("Exact-update test passed • gameplay sync not yet enabled");
            if (eventName == "timing_probe_failed") SetStatus("Timing test failed • scheduled update missed or clock reset • see Debug log");
            if (eventName == "timing_probe_timeout") SetStatus("Timing test timed out • was the simulation paused? No gameplay changes made");
            if (eventName == "timing_probe_disconnected") SetStatus("Timing test stopped • game bridge disconnected");
            if (eventName == "vehicle_test_enabled") SetStatus(code == "SCHEDULED_LOCAL_TEST" ? "SCHEDULED local vehicle test enabled • normal speed • remote joins blocked" : "IMMEDIATE local vehicle test enabled • remote joins blocked");
            if (eventName == "vehicle_test_already_enabled") SetStatus("Vehicle test already enabled • no need to enable again • see earlier result if it faulted");
            if (eventName == "vehicle_test_queued") SetStatus("Engine queued the vehicle action • waiting for its scheduled update");
            if (eventName == "vehicle_test_inspecting") SetStatus("Checking vehicle ownership • wait before sending another request");
            if (eventName == "vehicle_test_accepted") SetStatus(code == "HELD_UPDATE_LOCAL_TEST" ? "Applying vehicle action while held • do not resume or repeat" : code == "SCHEDULED_LOCAL_TEST" ? "Vehicle action scheduled • keep normal speed • wait for exact-update result" : "Immediate local vehicle action approved • waiting for engine result");
            if (eventName == "vehicle_test_applied") SetStatus(message.TryGetValue("scheduledUpdate", out value) && Convert.ToInt64(value) > 0 ? "Exact-update vehicle change verified • single-PC test only" : "Immediate vehicle state change verified • local only");
            if (eventName == "vehicle_test_rejected") SetStatus("Vehicle test rejected: " + code + " • inspect the vehicle; do not retry uncertain outcomes");
            if (eventName == "vehicle_test_input_ignored") SetStatus("Extra click ignored • one vehicle request at a time");
            if (eventName == "vehicle_test_disabled") SetStatus("Vehicle test disabled • inspect last action; restart Host to re-enable");
            if (kind == "transport_error" || eventName == "save_receive_failed") SetStatus("Connection failed. Check the host code, ports and firewall; see Debug.");
        } catch (ArgumentException) { }
    }

    private void StopHelper()
    {
        ResetBatchUi();
        Process process = helper; helper = null; if (process == null) return;
        hostReady = null;
        try { if (!process.HasExited) { process.StandardInput.WriteLine("stop"); if (!process.WaitForExit(2000)) process.Kill(); } } catch { }
    }

    private void ResetBatchUi()
    {
        if (!Dispatcher.CheckAccess()) { Dispatcher.BeginInvoke((Action)ResetBatchUi); return; }
        guidedBatchOwnsHelper = false; batchControlsReady = false;
        if (batchConfirmButton != null) batchConfirmButton.IsEnabled = false;
        if (batchStartButton != null) batchStartButton.IsEnabled = true;
        ResetPhase2SetupUi();
        if (advancedDiagnostics != null) advancedDiagnostics.IsEnabled = true;
    }

    private void ResetPhase2SetupUi()
    {
        ClearPendingPhase2SetupPlan(); phase2SetupConfirmed = false;
        if (phase2SetupConfirmButton != null) { phase2SetupConfirmButton.IsEnabled = false; phase2SetupConfirmButton.Visibility = Visibility.Collapsed; }
        if (phase2SetupButton != null) phase2SetupButton.IsEnabled = true;
    }

    private void ClearPendingPhase2SetupPlan() { pendingPhase2SetupHash = null; pendingPhase2OriginalCompany = 0; pendingPhase2TargetCompany = 0; pendingPhase2FundingAmount = 0; }
    private bool HasPendingPhase2SetupPlan() { return !phase2SetupConfirmed && IsPhase2SetupHash(pendingPhase2SetupHash) && pendingPhase2OriginalCompany > 0 && pendingPhase2TargetCompany > 0 && pendingPhase2OriginalCompany != pendingPhase2TargetCompany && pendingPhase2FundingAmount == 1000000; }
    private static bool IsPhase2SetupHash(string value) { return value != null && Regex.IsMatch(value, "^[0-9a-fA-F]{64}$"); }
    private static bool TryPhase2SetupCompanies(object original, object target, object funding, out int originalCompany, out int targetCompany, out int fundingAmount)
    {
        originalCompany = original is int ? (int)original : 0; targetCompany = target is int ? (int)target : 0; fundingAmount = funding is int ? (int)funding : 0;
        return originalCompany > 0 && targetCompany > 0 && originalCompany != targetCompany && fundingAmount == 1000000;
    }

    private string ValidateAndGetModHash()
    {
        RunCaptured("node.exe", new string[] { "src/cli.mjs", "review", "--path", "mod" });
        string buildOutput = RunCaptured("node.exe", new string[] { "src/cli.mjs", "hash-game", "--exe", GameExe });
        unauditedBuild = buildOutput.Contains("\"recommended\":false");
        string output = RunCaptured("node.exe", new string[] { "src/cli.mjs", "hash-mod", "--path", "mod" });
        Match match = Regex.Match(output, "(?i)\\b[0-9a-f]{64}\\b"); if (!match.Success) throw new InvalidOperationException("Could not calculate mod hash."); return match.Value.ToLowerInvariant();
    }

    private string RunCaptured(string file, string[] args)
    {
        StringBuilder output = new StringBuilder(); ProcessStartInfo info = new ProcessStartInfo(file, JoinArguments(args)) { WorkingDirectory = projectRoot, UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
        using (Process p = new Process { StartInfo = info }) { p.OutputDataReceived += delegate(object s, DataReceivedEventArgs a) { if (a.Data != null) { lock (output) output.AppendLine(a.Data); AppendLog(a.Data); } }; p.ErrorDataReceived += delegate(object s, DataReceivedEventArgs a) { if (a.Data != null) AppendLog("ERROR: " + a.Data); }; if (!p.Start()) throw new InvalidOperationException(file + " did not start."); p.BeginOutputReadLine(); p.BeginErrorReadLine(); p.WaitForExit(); p.WaitForExit(); if (p.ExitCode != 0) throw new InvalidOperationException("Check failed. Open Debug tools for details."); } return output.ToString();
    }

    private void RunBusy(string text, ThreadStart action)
    {
        if (busy) return; busy = true; SetStatus(text);
        ThreadPool.QueueUserWorkItem(delegate { try { action(); } catch (Exception exception) { Dispatcher.BeginInvoke((Action)delegate { MessageBox.Show(this, exception.Message, "TF3 Multiplayer", MessageBoxButton.OK, MessageBoxImage.Error); SetStatus("Could not continue"); }); } finally { busy = false; } });
    }

    private void AppendLog(string text) { Dispatcher.BeginInvoke((Action)delegate { logHistory.AppendLine(Redact(text)); if (logHistory.Length > 64000) logHistory.Remove(0, logHistory.Length - 48000); if (logBox != null && logBox.IsVisible) { logBox.Text = logHistory.ToString(); logBox.ScrollToEnd(); } }); }
    private static string Redact(string text) { return Regex.Replace(text, "(?i)(secret|token)\\\"?\\s*[:=]\\s*\\\"?[^,\\\"\\s]+", "$1:redacted"); }
    private void SetStatus(string text) { Dispatcher.BeginInvoke((Action)delegate { statusText.Text = text + (unauditedBuild ? " • Unaudited game version; audited build recommended" : ""); }); }

    private string FindLatestSave()
    {
        string[] dirs = FindSaveDirectories();
        return dirs.SelectMany(d => Directory.GetFiles(d, "*.sav", SearchOption.TopDirectoryOnly)).OrderByDescending(File.GetLastWriteTimeUtc).FirstOrDefault();
    }

    private string FindSaveDirectory() { return FindSaveDirectories().OrderByDescending(d => Directory.GetLastWriteTimeUtc(d)).FirstOrDefault(); }
    private string[] FindSaveDirectories()
    {
        try { string root = Directory.GetParent(Directory.GetParent(Directory.GetParent(Path.GetDirectoryName(GameExe)).FullName).FullName).FullName; string userdata = Path.Combine(root, "userdata"); if (!Directory.Exists(userdata)) return new string[0]; return Directory.GetDirectories(userdata).Select(d => Path.Combine(d, "3493540", "local", "save")).Where(Directory.Exists).ToArray(); } catch { return new string[0]; }
    }

    private string ChooseSave() { OpenFileDialog dialog = new OpenFileDialog { Filter = "Transport Fever 3 saves (*.sav)|*.sav", CheckFileExists = true, Title = "Choose a save with TF3MP enabled", InitialDirectory = FindSaveDirectory() ?? projectRoot }; return dialog.ShowDialog(this) == true ? dialog.FileName : null; }
    private string ChooseFolder() { using (System.Windows.Forms.FolderBrowserDialog dialog = new System.Windows.Forms.FolderBrowserDialog { Description = "Choose your TF3 local save folder", ShowNewFolderButton = false }) return dialog.ShowDialog() == System.Windows.Forms.DialogResult.OK ? dialog.SelectedPath : null; }

    private bool EnsureModAvailable(string saveDirectory)
    {
        string source = Path.Combine(projectRoot, "mod");
        string local = Directory.GetParent(saveDirectory).FullName;
        string destination = Path.Combine(local, "staging_area", "tf3mp_status_1");
        if (Directory.Exists(destination))
        {
            if (DirectoriesMatch(source, destination)) return true;
            MessageBox.Show(this, "The installed TF3MP mod differs from this launcher. Open Debug tools and update the staged copy before continuing.", "TF3MP mod mismatch", MessageBoxButton.OK, MessageBoxImage.Error);
            return false;
        }
        if (MessageBox.Show(this, "TalCo Transport Fever 3 MP mod is not installed for this TF3 user. Install the reviewed source mod now?\n\nThis copies only TF3MP into the per-user staging area. It does not edit the game or any save.", "Install required mod", MessageBoxButton.YesNo, MessageBoxImage.Question, MessageBoxResult.Yes) != MessageBoxResult.Yes) return false;
        try { CopyDirectory(source, destination); return DirectoriesMatch(source, destination); }
        catch (Exception exception) { MessageBox.Show(this, exception.Message, "Could not install TF3MP mod", MessageBoxButton.OK, MessageBoxImage.Error); return false; }
    }

    private static string GenerateSecret() { byte[] bytes = new byte[32]; using (RandomNumberGenerator rng = RandomNumberGenerator.Create()) rng.GetBytes(bytes); return Convert.ToBase64String(bytes); }
    private static string FindPrivateAddress()
    {
        foreach (IPAddress address in Dns.GetHostAddresses(Dns.GetHostName())) if (address.AddressFamily == AddressFamily.InterNetwork) { byte[] b = address.GetAddressBytes(); if (b[0] == 10 || (b[0] == 172 && b[1] >= 16 && b[1] <= 31) || (b[0] == 192 && b[1] == 168)) return address.ToString(); }
        return "127.0.0.1";
    }

    private static string CreateJoinCode(string address, string session, string sessionSecret, string hash, long expiresAt)
    {
        string raw = String.Join("\n", new string[] { address, GamePort.ToString(), SavePort.ToString(), session, sessionSecret, hash, expiresAt.ToString() });
        return "TF3MP2-" + Convert.ToBase64String(Encoding.UTF8.GetBytes(raw)).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }

    private static JoinDetails ParseJoinCode(string code)
    {
        string value = (code ?? "").Trim(); if (!value.StartsWith("TF3MP2-") || value.Length > 2048) throw new FormatException("This is not a valid TF3MP v2 join code.");
        string encoded = value.Substring(7).Replace('-', '+').Replace('_', '/'); while (encoded.Length % 4 != 0) encoded += "=";
        string[] fields; try { fields = Encoding.UTF8.GetString(Convert.FromBase64String(encoded)).Split('\n'); } catch { throw new FormatException("The join code is damaged or incomplete."); }
        int port, savePort; long expiresAt;
        if (fields.Length != 7 || !IsValidHostName(fields[0]) || !Int32.TryParse(fields[1], out port) || !Int32.TryParse(fields[2], out savePort) || port < 1 || port > 65535 || savePort < 1 || savePort > 65535 || fields[3].Length < 1 || fields[3].Length > 64 || Encoding.UTF8.GetByteCount(fields[4]) < 32 || !Regex.IsMatch(fields[5], "^[0-9a-fA-F]{64}$") || !Int64.TryParse(fields[6], out expiresAt)) throw new FormatException("The join code contains invalid session details.");
        long now = UnixNowMilliseconds();
        if (expiresAt <= now) throw new FormatException("This join code has expired. Ask the host for a new session code.");
        if (expiresAt > now + (24L * 60L * 60L * 1000L)) throw new FormatException("The join code expiry is invalid.");
        return new JoinDetails { Address = fields[0], Port = port, SavePort = savePort, Session = fields[3], Secret = fields[4], ModHash = fields[5].ToLowerInvariant(), ExpiresAt = expiresAt };
    }

    private static bool IsValidHostName(string value)
    {
        if (String.IsNullOrWhiteSpace(value) || value.Length > 253 || value.Contains(":") || value.Contains("/") || value.Contains("\\")) return false;
        IPAddress parsed;
        if (IPAddress.TryParse(value, out parsed)) return parsed.AddressFamily == AddressFamily.InterNetwork;
        return Uri.CheckHostName(value) == UriHostNameType.Dns;
    }

    private static long UnixNowMilliseconds() { return (long)(DateTime.UtcNow - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalMilliseconds; }

    private static string JoinArguments(string[] args) { StringBuilder result = new StringBuilder(); foreach (string arg in args) { if (result.Length > 0) result.Append(' '); result.Append(Quote(arg)); } return result.ToString(); }
    private static string Quote(string value) {
        StringBuilder quoted = new StringBuilder("\""); int slashes = 0;
        foreach (char c in value) {
            if (c == '\\') { slashes++; continue; }
            quoted.Append('\\', c == '"' ? slashes * 2 + 1 : slashes); quoted.Append(c); slashes = 0;
        }
        quoted.Append('\\', slashes * 2); quoted.Append('"'); return quoted.ToString();
    }

    private static bool DirectoriesMatch(string sourceRoot, string stagedRoot)
    {
        if (!Directory.Exists(stagedRoot)) return false; string[] source = Directory.GetFiles(sourceRoot, "*", SearchOption.AllDirectories), staged = Directory.GetFiles(stagedRoot, "*", SearchOption.AllDirectories).Where(f => !f.Substring(stagedRoot.Length).TrimStart('\\').StartsWith(".cooked_", StringComparison.OrdinalIgnoreCase)).ToArray(); if (source.Length != staged.Length) return false;
        foreach (string file in source) { string relative = file.Substring(sourceRoot.Length).TrimStart('\\'); string peer = Path.Combine(stagedRoot, relative); if (!File.Exists(peer) || !Hash(file).SequenceEqual(Hash(peer))) return false; } return true;
    }
    private static void CopyDirectory(string source, string destination) { Directory.CreateDirectory(destination); foreach (string file in Directory.GetFiles(source)) File.Copy(file, Path.Combine(destination, Path.GetFileName(file)), false); foreach (string directory in Directory.GetDirectories(source)) CopyDirectory(directory, Path.Combine(destination, Path.GetFileName(directory))); }
    private static byte[] Hash(string path) { using (SHA256 sha = SHA256.Create()) using (FileStream file = File.OpenRead(path)) return sha.ComputeHash(file); }

    private void OnClosing(object sender, System.ComponentModel.CancelEventArgs e)
    {
        if (helper != null && !helper.HasExited && MessageBox.Show(this, "Stop the active session and close?", "TF3 Multiplayer", MessageBoxButton.YesNo, MessageBoxImage.Question, MessageBoxResult.Yes) != MessageBoxResult.Yes) { e.Cancel = true; return; }
        StopHelper();
    }
}

internal sealed class JoinDetails { internal string Address, Session, Secret, ModHash; internal int Port, SavePort; internal long ExpiresAt; }

internal sealed class HostNetworkDetails
{
    internal bool IsInternet;
    internal string BindAddress, JoinAddress, LocalAddress;
}

internal sealed class HostSetupDialog : Window
{
    private readonly RadioButton internet;
    private readonly RadioButton lan;
    private readonly TextBox endpoint;
    private readonly string localAddress;
    internal HostNetworkDetails Details { get; private set; }

    internal HostSetupDialog(string detectedLocalAddress)
    {
        localAddress = detectedLocalAddress;
        Title = "Host connection"; Width = 600; Height = 440; ResizeMode = ResizeMode.NoResize;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;
        Background = new SolidColorBrush(Color.FromRgb(15, 20, 29)); Foreground = Brushes.White; FontFamily = new FontFamily("Segoe UI");
        Grid grid = new Grid { Margin = new Thickness(30) };
        grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto }); grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto }); grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        grid.RowDefinitions.Add(new RowDefinition()); grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        TextBlock title = new TextBlock { Text = "Where will your friend connect from?", FontSize = 23, FontWeight = FontWeights.SemiBold };
        StackPanel choices = new StackPanel { Margin = new Thickness(0, 20, 0, 12) };
        internet = new RadioButton { Content = "Internet — I will forward the ports", IsChecked = true, FontSize = 15, Foreground = Brushes.White, Margin = new Thickness(0, 0, 0, 12) };
        lan = new RadioButton { Content = "Same local network", FontSize = 15, Foreground = Brushes.White };
        choices.Children.Add(internet); choices.Children.Add(lan);
        TextBlock label = new TextBlock { Text = "Your public IPv4 address or DNS name", Foreground = new SolidColorBrush(Color.FromRgb(160, 174, 193)), Margin = new Thickness(0, 4, 0, 6) };
        endpoint = new TextBox { Padding = new Thickness(10), FontSize = 15, Background = new SolidColorBrush(Color.FromRgb(8, 12, 18)), Foreground = Brushes.White, BorderBrush = new SolidColorBrush(Color.FromRgb(75, 137, 255)) };
        TextBlock help = new TextBlock { Text = "Internet mode listens on this PC and puts the address above in the private code. Before your friend joins, forward TCP ports 37333–37334 to " + localAddress + ". The launcher does not change your router or firewall.", TextWrapping = TextWrapping.Wrap, LineHeight = 20, Foreground = new SolidColorBrush(Color.FromRgb(160, 174, 193)), Margin = new Thickness(0, 12, 0, 0) };
        StackPanel buttons = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right };
        Button cancel = new Button { Content = "Cancel", Width = 90, Height = 36, Margin = new Thickness(0, 0, 10, 0) }; cancel.Click += delegate { DialogResult = false; };
        Button start = new Button { Content = "Continue", Width = 120, Height = 36, Background = new SolidColorBrush(Color.FromRgb(67, 118, 232)), Foreground = Brushes.White, BorderThickness = new Thickness(0), FontWeight = FontWeights.SemiBold };
        start.Click += ContinueClicked; buttons.Children.Add(cancel); buttons.Children.Add(start);
        internet.Checked += delegate { endpoint.IsEnabled = true; label.Opacity = 1; }; lan.Checked += delegate { endpoint.IsEnabled = false; label.Opacity = 0.55; };
        Grid.SetRow(title, 0); Grid.SetRow(choices, 1); Grid.SetRow(label, 2); Grid.SetRow(endpoint, 3); Grid.SetRow(help, 4); Grid.SetRow(buttons, 5);
        grid.Children.Add(title); grid.Children.Add(choices); grid.Children.Add(label); grid.Children.Add(endpoint); grid.Children.Add(help); grid.Children.Add(buttons); Content = grid;
        Loaded += delegate { endpoint.Focus(); };
    }

    private void ContinueClicked(object sender, RoutedEventArgs e)
    {
        bool useInternet = internet.IsChecked == true;
        string address = useInternet ? endpoint.Text.Trim() : localAddress;
        if (useInternet && !ValidEndpoint(address))
        {
            MessageBox.Show(this, "Enter only a public IPv4 address or DNS name, without http:// or a port number.", "Public address required", MessageBoxButton.OK, MessageBoxImage.Warning);
            endpoint.Focus(); return;
        }
        if (!useInternet && address == "127.0.0.1")
        {
            MessageBox.Show(this, "No private LAN address was detected. Connect this PC to the local network and try again.", "LAN unavailable", MessageBoxButton.OK, MessageBoxImage.Warning); return;
        }
        Details = new HostNetworkDetails { IsInternet = useInternet, BindAddress = useInternet ? "0.0.0.0" : localAddress, JoinAddress = address, LocalAddress = localAddress };
        DialogResult = true;
    }

    private static bool ValidEndpoint(string value)
    {
        if (String.IsNullOrWhiteSpace(value) || value.Length > 253 || value.Contains(":") || value.Contains("/") || value.Contains("\\")) return false;
        IPAddress parsed;
        if (IPAddress.TryParse(value, out parsed))
        {
            if (parsed.AddressFamily != AddressFamily.InterNetwork) return false;
            byte[] b = parsed.GetAddressBytes();
            return b[0] != 0 && b[0] != 10 && b[0] != 127 && b[0] < 224
                && !(b[0] == 100 && b[1] >= 64 && b[1] <= 127)
                && !(b[0] == 169 && b[1] == 254)
                && !(b[0] == 172 && b[1] >= 16 && b[1] <= 31)
                && !(b[0] == 192 && b[1] == 168);
        }
        return Uri.CheckHostName(value) == UriHostNameType.Dns;
    }
}

internal sealed class JoinCodeDialog : Window
{
    private readonly TextBox input;
    internal string Code { get { return input.Text; } }
    internal JoinCodeDialog()
    {
        Title = "Join TF3 Multiplayer"; Width = 650; Height = 310; ResizeMode = ResizeMode.NoResize; WindowStartupLocation = WindowStartupLocation.CenterOwner; Background = new SolidColorBrush(Color.FromRgb(15, 20, 29)); Foreground = Brushes.White; FontFamily = new FontFamily("Segoe UI");
        Grid grid = new Grid { Margin = new Thickness(28) }; grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto }); grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto }); grid.RowDefinitions.Add(new RowDefinition()); grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        TextBlock title = new TextBlock { Text = "Enter the host's join code", FontSize = 23, FontWeight = FontWeights.SemiBold };
        TextBlock note = new TextBlock { Text = "The code contains the private session key. Only accept it from someone you trust.", Foreground = new SolidColorBrush(Color.FromRgb(160, 174, 193)), Margin = new Thickness(0, 8, 0, 14) };
        input = new TextBox { AcceptsReturn = true, TextWrapping = TextWrapping.Wrap, Padding = new Thickness(10), Background = new SolidColorBrush(Color.FromRgb(8, 12, 18)), Foreground = Brushes.White, BorderBrush = new SolidColorBrush(Color.FromRgb(75, 137, 255)), MinHeight = 80 };
        StackPanel buttons = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right, Margin = new Thickness(0, 16, 0, 0) };
        Button cancel = new Button { Content = "Cancel", Width = 90, Height = 36, Margin = new Thickness(0, 0, 10, 0) }; cancel.Click += delegate { DialogResult = false; };
        Button join = new Button { Content = "Join", Width = 110, Height = 36, Background = new SolidColorBrush(Color.FromRgb(38, 166, 126)), Foreground = Brushes.White, BorderThickness = new Thickness(0), FontWeight = FontWeights.SemiBold }; join.Click += delegate { DialogResult = true; };
        buttons.Children.Add(cancel); buttons.Children.Add(join); Grid.SetRow(title, 0); Grid.SetRow(note, 1); Grid.SetRow(input, 2); Grid.SetRow(buttons, 3); grid.Children.Add(title); grid.Children.Add(note); grid.Children.Add(input); grid.Children.Add(buttons); Content = grid;
        Loaded += delegate { input.Focus(); };
    }
}
