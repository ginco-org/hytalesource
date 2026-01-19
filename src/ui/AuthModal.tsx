import { Modal, Typography, Button, Space, Spin } from "antd";
import { useObservable } from "../utils/UseObservable";
import { authInstructions } from "../logic/HytaleApi";

const { Paragraph, Text } = Typography;

const AuthModal = () => {
    const instructions = useObservable(authInstructions);

    if (!instructions) {
        return null;
    }

    return (
        <Modal
            title="Hytale Authentication Required"
            open={true}
            footer={null}
            closable={false}
        >
            <Space direction="vertical" style={{ width: '100%' }} align="center">
                <Spin size="large" />

                <Paragraph>
                    Redirecting to Hytale authentication...
                </Paragraph>

                <Paragraph type="secondary" style={{ fontSize: '12px' }}>
                    If you are not redirected automatically, click the button below:
                </Paragraph>

                <Button
                    type="primary"
                    onClick={() => window.location.href = instructions.authUrl}
                >
                    Login with Hytale Account
                </Button>
            </Space>
        </Modal>
    );
};

export default AuthModal;
