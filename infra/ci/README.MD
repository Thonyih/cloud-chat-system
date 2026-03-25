# Start the VM for CI/CD and setup the Runner

### 1. Create a Gitlab runner

- In git lab make sure to create a new runner
- Make sure to tag `Run untagged jobs` (terraform will also enforce this on the VM)
- Choose Linux machine

You will something like

```bash
gitlab-runner register  --url https://gitlab.rnl.tecnico.ulisboa.pt  --token glrt-t3_gt3tCTJoWj7w_aazVBDQ
```

Copy the token `glrt-t3_KsASRds7PCV3qoYvnHCp` and move on to the next step

### 2. Run Terraform to create the VM for the Runner

cd to Application/infra/ci then

```bash
terraform init
terraform apply
```

### 3. SSH to the machine

Run the following (Change the IP accordingly)

```bash
gcloud compute ssh gitlab-runner --project agisit25-g60 --zone europe-west1-b
```

### 4. Run the following to setup

```bash
sudo apt-get update -y
sudo apt-get install -y docker.io curl
sudo systemctl enable --now docker

sudo curl -L -o /usr/local/bin/gitlab-runner https://gitlab-runner-downloads.s3.amazonaws.com/latest/binaries/gitlab-runner-linux-amd64
sudo chmod +x /usr/local/bin/gitlab-runner
sudo useradd --comment 'GitLab Runner' --create-home gitlab-runner --shell /bin/bash || true
sudo /usr/local/bin/gitlab-runner install --user=gitlab-runner --working-directory=/home/gitlab-runner
```

Then run the following (replace `<runner-token>` with the token obtained in step 1)

```bash
sudo gitlab-runner register \
  --url https://gitlab.rnl.tecnico.ulisboa.pt \
  --registration-token glrt-t3_gveWJxopaGRriSUfZXJV \
  --executor docker \
  --docker-image alpine:latest

sudo systemctl enable --now gitlab-runner
sudo systemctl restart gitlab-runner
```
