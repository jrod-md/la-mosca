# Runs the verified mushroom body extraction with the project's chosen cell types (right hemisphere).
# Prompts for the neuPrint token, keeps it only in this process, and removes it afterwards.
#
# Type choices (from --inspect on male-cns:v1.0):
# - PN: uniglomerular adPN/lPN types, the excitatory projection neurons that reach the calyx;
#   vPN and multiglomerular types are excluded. One cell per glomerulus = one input channel.
# - KC: main olfactory subtypes; rare KCg-s*, KC and KCg labels and KCab-p/KCg-d (mostly
#   non-olfactory input) are excluded.
# - MBON01-MBON35 (no "-like" variants), PAM01-PAM15 as reward DANs, PPL101-PPL108 as punishment DANs.
$ErrorActionPreference = 'Stop'

$pn = 'DA1_lPN','DA2_lPN','DA3_adPN','DA4l_adPN','DA4m_adPN','DC1_adPN','DC2_adPN','DC3_adPN','DC4_adPN',
  'DL1_adPN','DL2d_adPN','DL2v_adPN','DL3_lPN','DL4_adPN','DL5_adPN','DM1_lPN','DM2_lPN','DM3_adPN','DM4_adPN',
  'DM5_lPN','DM6_adPN','DP1l_adPN','DP1m_adPN','D_adPN','VA1d_adPN','VA1v_adPN','VA2_adPN','VA3_adPN','VA4_lPN',
  'VA5_lPN','VA6_adPN','VA7l_adPN','VA7m_lPN','VC1_lPN','VC2_lPN','VC3_adPN','VC4_adPN','VL2a_adPN','VL2p_adPN',
  'VM1_lPN','VM2_adPN','VM3_adPN','VM4_adPN','VM5d_adPN','VM5v_adPN','VM6_adPN','VM7d_adPN','VM7v_adPN'
$kc = 'KCab-c','KCab-m','KCab-s',"KCa'b'-ap2","KCa'b'-m",'KCg-m'
$mbon = 1..35 | Where-Object { $_ -ne 8 } | ForEach-Object { 'MBON{0:D2}' -f $_ }
$pam = 1..15 | ForEach-Object { 'PAM{0:D2}' -f $_ }
$ppl = 1..8 | ForEach-Object { 'PPL1{0:D2}' -f $_ }

$arguments = @('scripts/extract_mushroom_body.py', '--side', 'R', '--max-pn', '48', '--max-kc', '160',
  '--max-mbon', '40', '--max-dan-reward', '40', '--max-dan-punishment', '12')
$arguments += $pn | ForEach-Object { '--pn-type', $_ }
$arguments += $kc | ForEach-Object { '--kc-type', $_ }
$arguments += $mbon | ForEach-Object { '--mbon-type', $_ }
$arguments += $pam | ForEach-Object { '--dan-reward-type', $_ }
$arguments += $ppl | ForEach-Object { '--dan-punishment-type', $_ }
$arguments += $args

$secret = Read-Host 'neuPrint token' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try {
  $env:NEUPRINT_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  & .\.venv\Scripts\python.exe @arguments
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  Remove-Item Env:NEUPRINT_TOKEN -ErrorAction SilentlyContinue
}
